"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { CalendarPlusIcon, Loader2Icon, CheckCircle2Icon, AlertCircleIcon, Trash2Icon, SearchIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
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

interface SkippedContract {
  contractCode: string
  property: string
  tenant: string
  reason: string
}

interface PreviewData {
  month: string
  total: number
  pending: number
  existing: number
  skipped?: number
  contracts: ContractPreview[]
  skippedContracts?: SkippedContract[]
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
  // Selecao especifica de contratos
  const [search, setSearch] = useState("")
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState<"all" | "specific">("all")

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
      const timer = setTimeout(() => {
        setResult(null)
        setPreview(null)
        setSearch("")
        setSelectedCodes(new Set())
        setSelectMode("all")
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Reset selecao quando muda o mes
  useEffect(() => {
    setSelectedCodes(new Set())
    setSearch("")
    setSelectMode("all")
  }, [selectedMonth])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const payload: { month: string; contractCodes?: string[] } = { month: selectedMonth }
      if (selectMode === "specific" && selectedCodes.size > 0) {
        payload.contractCodes = Array.from(selectedCodes)
      }
      const res = await fetch("/api/billing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  // Filtra pendentes pela busca (locatario, codigo do contrato, imovel)
  const filteredPending = useMemo(() => {
    if (!search.trim()) return pendingContracts
    const term = search.trim().toLowerCase()
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    const termN = norm(term)
    return pendingContracts.filter(
      (c) =>
        norm(c.tenant || "").includes(termN) ||
        norm(c.contractCode || "").includes(termN) ||
        norm(c.property || "").includes(termN) ||
        norm(c.owner || "").includes(termN),
    )
  }, [pendingContracts, search])

  // Quais contratos serao gerados ao clicar no botao
  const contractsToGenerate = selectMode === "specific"
    ? pendingContracts.filter((c) => selectedCodes.has(c.contractCode))
    : pendingContracts

  function toggleSelect(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function toggleSelectAll() {
    if (filteredPending.every((c) => selectedCodes.has(c.contractCode))) {
      // Todos da busca atual ja selecionados → desmarca os filtrados
      setSelectedCodes((prev) => {
        const next = new Set(prev)
        for (const c of filteredPending) next.delete(c.contractCode)
        return next
      })
    } else {
      setSelectedCodes((prev) => {
        const next = new Set(prev)
        for (const c of filteredPending) next.add(c.contractCode)
        return next
      })
    }
  }

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
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    {pendingContracts.length} cobranca(s) a gerar
                  </p>
                  {/* Toggle entre 'todos' e 'especificos' */}
                  <div className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      className={`px-2 py-1 rounded ${selectMode === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
                      onClick={() => setSelectMode("all")}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-1 rounded ${selectMode === "specific" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
                      onClick={() => setSelectMode("specific")}
                    >
                      Selecionar
                    </button>
                  </div>
                </div>

                {/* Busca + selecionar tudo (so aparece no modo 'specific') */}
                {selectMode === "specific" && (
                  <div className="space-y-2">
                    <div className="relative">
                      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por locatario, contrato ou imovel..."
                        className="pl-8 h-8 text-xs"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={toggleSelectAll}
                      >
                        {filteredPending.length > 0 && filteredPending.every((c) => selectedCodes.has(c.contractCode))
                          ? "Desmarcar todos"
                          : "Selecionar todos"}{search ? " (filtrados)" : ""}
                      </button>
                      <span className="text-muted-foreground">
                        {selectedCodes.size} selecionado(s)
                      </span>
                    </div>
                  </div>
                )}

                <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                  {(selectMode === "specific" ? filteredPending : pendingContracts).map((c) => {
                    const checked = selectedCodes.has(c.contractCode)
                    return (
                      <label
                        key={c.contractCode}
                        className={`px-3 py-2 text-sm flex items-start gap-2 ${selectMode === "specific" ? "cursor-pointer hover:bg-muted/40" : ""}`}
                      >
                        {selectMode === "specific" && (
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSelect(c.contractCode)}
                            className="mt-0.5"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{c.contractCode}</span>
                            <span className="text-emerald-600 font-medium shrink-0">{formatCurrency(c.value)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {c.tenant} &bull; Venc. dia {c.paymentDay}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                  {selectMode === "specific" && filteredPending.length === 0 && (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                      Nenhum contrato encontrado para a busca.
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total: {formatCurrency(contractsToGenerate.reduce((sum, c) => sum + c.value, 0))}
                  {selectMode === "specific" && (
                    <span className="ml-1">
                      ({contractsToGenerate.length} de {pendingContracts.length})
                    </span>
                  )}
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

            {/* Contratos pulados — nao serao gerados */}
            {preview?.skippedContracts && preview.skippedContracts.length > 0 && (
              <details className="rounded-md bg-orange-50 dark:bg-orange-950/30 p-3 group">
                <summary className="text-xs font-medium text-orange-700 dark:text-orange-400 cursor-pointer flex items-center gap-2">
                  <AlertCircleIcon className="size-3.5" />
                  {preview.skippedContracts.length} contrato(s) nao geraveis (clique para ver motivo)
                </summary>
                <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {preview.skippedContracts.map((s, i) => (
                    <div
                      key={i}
                      className="text-xs flex items-start justify-between gap-3 py-1.5 border-b border-orange-200/50 dark:border-orange-900/50 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-orange-900 dark:text-orange-300">
                          {s.contractCode}
                        </p>
                        <p className="text-orange-700/80 dark:text-orange-400/70 truncate">
                          {s.tenant !== "—" ? s.tenant : s.property}
                        </p>
                      </div>
                      <p className="text-orange-700 dark:text-orange-400 text-right shrink-0">
                        {s.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
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
                disabled={generating || loadingPreview || contractsToGenerate.length === 0}
              >
                {generating ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <CalendarPlusIcon className="size-4" />
                    Gerar {contractsToGenerate.length} cobranca(s)
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
