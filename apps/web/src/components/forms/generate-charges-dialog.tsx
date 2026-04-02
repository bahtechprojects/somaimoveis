"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { CalendarPlusIcon, Loader2Icon, CheckCircle2Icon, AlertCircleIcon, Trash2Icon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ContractPreview {
  contractCode: string
  property: string
  tenant: string
  owner: string
  value: number
  paymentDay: number
  alreadyExists: boolean
}

interface PreviewData {
  month: string
  total: number
  pending: number
  existing: number
  contracts: ContractPreview[]
}

interface GenerateResult {
  generated: number
  skipped: number
  errors: { contract: string; message: string }[]
  month: string
  message: string
}

interface GenerateChargesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function getMonthOptions() {
  const options: { value: string; label: string }[] = []
  const now = new Date()

  // Current month + next 3 months
  for (let i = 0; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }

  return options
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

export function GenerateChargesDialog({
  open,
  onOpenChange,
  onSuccess,
}: GenerateChargesDialogProps) {
  const monthOptions = getMonthOptions()
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[1]?.value || monthOptions[0]?.value)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)

  const loadPreview = useCallback(async (month: string) => {
    setLoadingPreview(true)
    setResult(null)
    try {
      const res = await fetch(`/api/billing/generate?month=${month}`)
      if (res.ok) {
        const data = await res.json()
        setPreview(data)
      }
    } catch {
      // ignore
    } finally {
      setLoadingPreview(false)
    }
  }, [])

  useEffect(() => {
    if (open && selectedMonth && !result) {
      loadPreview(selectedMonth)
    }
  }, [open, selectedMonth, loadPreview, result])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Delay reset so close animation completes
      const timer = setTimeout(() => {
        setResult(null)
        setPreview(null)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch("/api/billing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth }),
      })
      const data = await res.json()
      setResult(data)
      if (data.generated > 0) {
        onSuccess()
      }
    } catch {
      toast.error("Erro ao gerar cobrancas")
    } finally {
      setGenerating(false)
    }
  }

  async function handleClearPending() {
    if (!confirm(`Tem certeza que deseja excluir TODAS as cobranças pendentes de ${preview?.month || selectedMonth}? Esta ação não pode ser desfeita.`)) {
      return
    }
    setClearing(true)
    try {
      const res = await fetch(`/api/billing/clear?month=${selectedMonth}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message)
        onSuccess()
        // Reload preview
        loadPreview(selectedMonth)
      } else {
        toast.error(data.error || "Erro ao excluir cobranças")
      }
    } catch {
      toast.error("Erro ao excluir cobranças")
    } finally {
      setClearing(false)
    }
  }

  const pendingContracts = preview?.contracts.filter((c) => !c.alreadyExists) || []
  const existingContracts = preview?.contracts.filter((c) => c.alreadyExists) || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg sm:max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlusIcon className="size-5" />
            Gerar Cobrancas
          </DialogTitle>
          <DialogDescription>
            Gere cobrancas automaticamente para todos os contratos ativos.
          </DialogDescription>
        </DialogHeader>

        {/* Month selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Mes de referencia</label>
          <Select
            value={selectedMonth}
            onValueChange={setSelectedMonth}
            disabled={generating || !!result}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Loading */}
        {loadingPreview && (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Preview */}
        {!loadingPreview && preview && !result && (
          <div className="space-y-3">
            {pendingContracts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {pendingContracts.length} cobranca(s) a gerar:
                </p>
                <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                  {pendingContracts.map((c) => (
                    <div key={c.contractCode} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.contractCode}</span>
                        <span className="text-emerald-600 font-medium">{formatCurrency(c.value)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.tenant} &bull; Venc. dia {c.paymentDay}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total: {formatCurrency(pendingContracts.reduce((sum, c) => sum + c.value, 0))}
                </p>
              </div>
            )}

            {existingContracts.length > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {existingContracts.length} contrato(s) ja possuem cobranca para este mes.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  className="shrink-0 text-xs h-7"
                  onClick={handleClearPending}
                  disabled={clearing || generating}
                >
                  {clearing ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-3" />
                  )}
                  Excluir pendentes
                </Button>
              </div>
            )}

            {pendingContracts.length === 0 && existingContracts.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Nenhum contrato ativo encontrado para este periodo.
              </div>
            )}

            {pendingContracts.length === 0 && existingContracts.length > 0 && (
              <div className="text-center py-6 space-y-3">
                <p className="text-muted-foreground text-sm">
                  Todas as cobrancas ja foram geradas para este mes.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearPending}
                  disabled={clearing || generating}
                >
                  {clearing ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Excluindo...
                    </>
                  ) : (
                    <>
                      <Trash2Icon className="size-4" />
                      Excluir todas pendentes e regerar
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-3">
            {result.generated > 0 ? (
              <div className="flex items-start gap-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-4">
                <CheckCircle2Icon className="size-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    {result.generated} cobranca(s) gerada(s)
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    {result.message}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-md bg-amber-50 dark:bg-amber-950/30 p-4">
                <AlertCircleIcon className="size-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Nenhuma cobranca gerada
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {result.message}
                  </p>
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3">
                <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
                  {result.errors.length} erro(s):
                </p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">
                    {e.contract}: {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={generating}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating || loadingPreview || pendingContracts.length === 0}
              >
                {generating ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <CalendarPlusIcon className="size-4" />
                    Gerar {pendingContracts.length} cobranca(s)
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
