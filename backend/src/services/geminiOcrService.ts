import { GoogleGenAI, Type, Schema } from '@google/genai';
import { env } from '../config/env';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export interface ExtractedBillItem {
  name: string;
  quantity: number;
  priceRupees: number;
}

export interface GeminiBillOcrResult {
  merchantName: string;
  billDate: string | null;
  totalRupees: number | null;
  suggestedCategory: string;
  paymentVia: 'UPI' | 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'UNSPECIFIED' | null;
  lineItems: ExtractedBillItem[];
  summaryNote: string;
  confidence: number;
}

const FAST_RECEIPT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    amount: {
      type: Type.NUMBER,
      nullable: true,
      description: 'Total amount in INR/Rupees',
    },
    merchant: {
      type: Type.STRING,
      nullable: true,
      description: 'Merchant or shop name',
    },
    date: {
      type: Type.STRING,
      nullable: true,
      description: 'Receipt date in YYYY-MM-DD format',
    },
  },
  required: ['amount', 'merchant', 'date'],
};

/**
 * Ultra-fast receipt OCR parser using Gemini 1.5 Flash with strict 15-second timeout.
 * Extracts:
 * 1. total_amount (number or null)
 * 2. merchant_name (concise string or null)
 * 3. date (YYYY-MM-DD or null)
 */
export async function extractBillWithGeminiVision(params: {
  imageBase64: string;
  mimeType: string;
  workspaceMode?: 'PERSONAL' | 'BUSINESS';
}): Promise<GeminiBillOcrResult> {
  try {
    const promptText = `Extract the following from this receipt image:
1. total_amount (number or null)
2. merchant_name (concise string or null)
3. date (YYYY-MM-DD or null)
Output JSON only: {"amount": number, "merchant": string, "date": string}`;

    const ocrCall = ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: params.imageBase64,
            mimeType: params.mimeType,
          },
        },
        promptText,
      ],
      config: {
        systemInstruction:
          'You are an Indian receipt and bill OCR extractor. Extract the grand total in Indian Rupees as a number (amount), the shop/store/merchant name as string (merchant), and receipt date as string in YYYY-MM-DD format (date). If missing or ambiguous, use null.',
        responseMimeType: 'application/json',
        responseSchema: FAST_RECEIPT_SCHEMA,
        temperature: 0.1,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('OCR request timed out after 15s')), 15000)
    );

    const response = await Promise.race([ocrCall, timeoutPromise]);
    const rawText = response.text || '{}';
    const parsed = JSON.parse(rawText);

    const amount =
      typeof parsed.amount === 'number' && !isNaN(parsed.amount) && parsed.amount > 0
        ? parsed.amount
        : null;
    const merchant =
      parsed.merchant && typeof parsed.merchant === 'string' && parsed.merchant.trim().length > 0
        ? parsed.merchant.trim()
        : amount
        ? 'Receipt Expense'
        : 'Scanned Bill';
    const date =
      parsed.date && typeof parsed.date === 'string'
        ? parsed.date
        : new Date().toISOString().slice(0, 10);

    return {
      merchantName: merchant,
      billDate: date,
      totalRupees: amount,
      suggestedCategory: 'Grocery & Rashan',
      paymentVia: 'UNSPECIFIED',
      lineItems: [],
      summaryNote: merchant ? `Receipt from ${merchant}` : 'Receipt Expense',
      confidence: amount ? 0.95 : 0.4,
    };
  } catch (err: unknown) {
    console.warn('⚠️ Gemini OCR error/timeout, providing clean fallback:', err);
    return {
      merchantName: 'Receipt Expense',
      billDate: new Date().toISOString().slice(0, 10),
      totalRupees: null,
      suggestedCategory: 'Bills & Utilities',
      paymentVia: 'UNSPECIFIED',
      lineItems: [],
      summaryNote: 'Scanned receipt (manual review)',
      confidence: 0.0,
    };
  }
}
