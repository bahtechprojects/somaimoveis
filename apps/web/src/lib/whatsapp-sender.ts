// ==================================================
// Servico de envio de mensagens WhatsApp via Uazapi
// https://docs.uazapi.com
// ==================================================

const UAZAPI_URL = process.env.UAZAPI_URL;
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN;

// Delay entre mensagens (ms) para evitar rate limit da Uazapi
const MESSAGE_DELAY_MS = 1500;

// Fila simples para envio sequencial com delay
let sendQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    sendQueue = sendQueue.then(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
      // Delay entre mensagens
      await new Promise((r) => setTimeout(r, MESSAGE_DELAY_MS));
    });
  });
}

export interface WhatsAppMessage {
  to: string; // Numero de telefone do destinatario
  message: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Formata numero de telefone para o padrao Uazapi (55XXXXXXXXXXX)
 * Remove +, espacos, hifens, parenteses e garante DDI 55
 */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  // Se ja comeca com 55 e tem 12-13 digitos, esta correto
  if (digits.startsWith("55") && digits.length >= 12) {
    return digits;
  }

  // Se tem 10-11 digitos (DDD + numero), adiciona 55
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }

  // Retorna como esta (a API vai validar)
  return digits;
}

/**
 * Verifica se a integracao Uazapi esta configurada
 */
export function isUazapiConfigured(): boolean {
  return !!(UAZAPI_URL && UAZAPI_TOKEN);
}

/**
 * Envio direto (sem fila) - usado internamente
 */
async function doSendText(msg: WhatsAppMessage): Promise<SendResult> {
  // Valida numero
  const cleanPhone = msg.to.replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    return {
      success: false,
      error: `Numero de telefone invalido: ${msg.to}`,
    };
  }

  // Fallback mock se Uazapi nao estiver configurado
  if (!UAZAPI_URL || !UAZAPI_TOKEN) {
    console.log(
      `[WhatsApp Mock] Enviando para ${msg.to}: ${msg.message.substring(0, 80)}...`
    );
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[WhatsApp Mock] ID: ${messageId}`);
    return { success: true, messageId };
  }

  // Envio real via Uazapi
  const number = formatPhone(msg.to);
  try {
    const response = await fetch(`${UAZAPI_URL}/send/text`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number,
        text: msg.message,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Uazapi] Erro ${response.status}:`, data);
      return {
        success: false,
        error: data?.message || data?.error || `Erro HTTP ${response.status}`,
      };
    }

    console.log(`[Uazapi] Mensagem enviada para ${number}. Response:`, data);
    return {
      success: true,
      messageId: data?.key?.id || data?.messageId || data?.id || `uazapi-${Date.now()}`,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error(`[Uazapi] Falha ao enviar para ${number}:`, errMsg);
    return {
      success: false,
      error: errMsg,
    };
  }
}

/**
 * Envia uma mensagem de texto via WhatsApp usando Uazapi.
 * Enfileira automaticamente com delay entre mensagens para evitar rate limit.
 */
export function sendWhatsAppMessage(msg: WhatsAppMessage): Promise<SendResult> {
  return enqueue(() => doSendText(msg));
}

/**
 * Envio direto de documento (sem fila)
 */
async function doSendDocument(params: {
  to: string;
  fileUrl: string;
  fileName: string;
  caption?: string;
}): Promise<SendResult> {
  const cleanPhone = params.to.replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    return {
      success: false,
      error: `Numero de telefone invalido: ${params.to}`,
    };
  }

  if (!UAZAPI_URL || !UAZAPI_TOKEN) {
    console.log(
      `[WhatsApp Mock] Enviando documento "${params.fileName}" para ${params.to}`
    );
    return {
      success: true,
      messageId: `mock-doc-${Date.now()}`,
    };
  }

  const number = formatPhone(params.to);
  try {
    const response = await fetch(`${UAZAPI_URL}/send/media`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number,
        type: "document",
        file: params.fileUrl,
        docName: params.fileName,
        text: params.caption || "",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Uazapi] Erro envio documento ${response.status}:`, data);
      return {
        success: false,
        error: data?.message || data?.error || `Erro HTTP ${response.status}`,
      };
    }

    console.log(`[Uazapi] Documento enviado para ${number}. Response:`, data);
    return {
      success: true,
      messageId: data?.key?.id || data?.messageId || data?.id || `uazapi-doc-${Date.now()}`,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error(`[Uazapi] Falha ao enviar documento para ${number}:`, errMsg);
    return {
      success: false,
      error: errMsg,
    };
  }
}

/**
 * Envia um documento (PDF, imagem, etc) via WhatsApp usando Uazapi.
 * Enfileira automaticamente com delay entre mensagens.
 */
export function sendWhatsAppDocument(params: {
  to: string;
  fileUrl: string;
  fileName: string;
  caption?: string;
}): Promise<SendResult> {
  return enqueue(() => doSendDocument(params));
}

/**
 * Envia uma mensagem via Email.
 * MOCK - apenas loga no console.
 */
export async function sendEmailMessage(msg: {
  to: string;
  subject: string;
  message: string;
}): Promise<SendResult> {
  console.log(
    `[Email Mock] Enviando para ${msg.to}: ${msg.subject}`
  );
  await new Promise((r) => setTimeout(r, 100));
  return {
    success: true,
    messageId: `email-mock-${Date.now()}`,
  };
}

/**
 * Envia uma mensagem via SMS.
 * MOCK - apenas loga no console.
 */
export async function sendSmsMessage(msg: {
  to: string;
  message: string;
}): Promise<SendResult> {
  console.log(
    `[SMS Mock] Enviando para ${msg.to}: ${msg.message.substring(0, 50)}...`
  );
  await new Promise((r) => setTimeout(r, 150));
  return {
    success: true,
    messageId: `sms-mock-${Date.now()}`,
  };
}
