"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Download, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "somma-pwa-dismiss";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const dismissedAt = localStorage.getItem(DISMISS_KEY);
  if (!dismissedAt) return false;
  const elapsed = Date.now() - parseInt(dismissedAt, 10);
  if (elapsed > DISMISS_DURATION_MS) {
    localStorage.removeItem(DISMISS_KEY);
    return false;
  }
  return true;
}

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Don't show if already installed or recently dismissed
    if (isStandalone() || isDismissed()) return;

    // Detect iOS for manual install instructions
    const iosDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsIOS(iosDevice);

    // For iOS, show the banner after a delay (no beforeinstallprompt on Safari)
    if (iosDevice && isMobileDevice()) {
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }

    // For Android/Chrome: listen for the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show the banner after a short delay
      setTimeout(() => setShow(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        setShow(false);
      }
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-16 md:bottom-0 inset-x-0 z-40 p-4 pb-safe animate-in slide-in-from-bottom duration-300">
      <div className="mx-auto max-w-md rounded-xl border border-border bg-white shadow-lg overflow-hidden">
        {/* Olive green accent bar */}
        <div className="h-1 bg-[#4a5a2b]" />

        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="flex-shrink-0 w-10 h-10 bg-[#4a5a2b] rounded-lg flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                Instalar Somma Portal
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {isIOS
                  ? 'Toque no botao de compartilhar e selecione "Adicionar a Tela de Inicio".'
                  : "Acesse o portal direto da tela inicial do seu celular."}
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3 ml-[52px]">
            {!isIOS && (
              <button
                onClick={handleInstall}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#4a5a2b] hover:bg-[#3d4b24] rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Instalar App
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Agora nao
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
