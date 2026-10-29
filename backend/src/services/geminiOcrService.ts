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
  paymentVia: 'UPI' | 'CASH' | 'CARD' | 'BANK_TRANSFER';
  lineItems: ExtractedBillItem[];
  summaryNote: string;
  confidence: number;
}

const BILL_OCR_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    merchantName: {
      type: Type.STRING,
      description: 'Shop, store, kirana, or restaurant name printed/written on the bill.',
    },
    billDate: {
      type: Type.STRING,
      nullable: true,
      description: 'Bill date in YYYY-MM-DD format if visible, otherwise null.',
    },
    totalRupees: {
      type: Type.NUMBER,
      nullable: true,
      description: 'Final grand total amount in Indian Rupees.',
    },
    suggestedCategory: {
      type: Type.STRING,
      description:
        'Category such as "Grocery & Rashan", "Chai & Dining", "Petrol & Travel", "Bills & Recharge", or "Dukaan Stock / Maal".',
    },
    paymentVia: {
      type: Type.STRING,
      enum: ['UPI', 'CASH', 'CARD', 'BANK_TRANSFER'],
      description: 'Payment mode detected on receipt, default UPI or CASH.',
    },
    lineItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          priceRupees: { type: Type.NUMBER },
        },
        required: ['name', 'quantity', 'priceRupees'],
      },
    },
    summaryNote: {
      type: Type.STRING,
      description: 'Short Hinglish summary of the items on the bill.',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'OCR confidence between 0.0 and 1.0.',
    },
  },
  required: [
    'merchantName',
    'suggestedCategory',
    'paymentVia',
    'lineItems',
    'summaryNote',
    'confidence',
  ],
};

/**
 * Extracts structured merchant, line items, and total Rupees from a paper bill photo
 * using Google Gemini Vision. Deterministic code converts Rupees to Paise afterwards.
 */
export async function extractBillWithGeminiVision(params: {
  imageBase64: string;
  mimeType: string;
  workspaceMode: 'PERSONAL' | 'BUSINESS';
}): Promise<GeminiBillOcrResult> {
  const systemPrompt = `You are FinTrack's Indian Receipt & Kirana Parchi OCR reader.
Active workspace mode: ${params.workspaceMode}.
Extract the shop/merchant name, bill date (YYYY-MM-DD), grand total in Rupees (totalRupees), line items, and a concise Hinglish summaryNote.
Never invent totals if unreadable; set totalRupees to null if completely missing.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        inlineData: {
          data: params.imageBase64,
          mimeType: params.mimeType,
        },
      },
      'Read this Indian bill/receipt image and extract the structured JSON draft.',
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: BILL_OCR_SCHEMA,
      temperature: 0.1,
    },
  });

  const rawText = response.text || '{}';
  return JSON.parse(rawText) as GeminiBillOcrResult;
}

