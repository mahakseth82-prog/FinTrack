import { GoogleGenAI, Type, Schema } from '@google/genai';
import { env } from '../config/env';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export interface GeminiExtractedDraft {
  transcript: string;
  intent: 'EXPENSE' | 'INCOME' | 'UDHAAR_GAVE' | 'UDHAAR_GOT' | 'UDHAAR_REPAYMENT';
  extractedRupees: number | null;
  extractedContactName: string | null;
  extractedCategoryName: string | null;
  extractedDueDate: string | null; // YYYY-MM-DD
  paymentVia: 'UPI' | 'CASH' | 'CARD' | 'BANK_TRANSFER';
  description: string;
  needsClarification: boolean;
  ambiguityQuestion: string | null;
  confidence: number;
}

const EXTRACTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    transcript: {
      type: Type.STRING,
      description: 'Exact transcript of what the user said in Hindi, Hinglish, or English.',
    },
    intent: {
      type: Type.STRING,
      enum: ['EXPENSE', 'INCOME', 'UDHAAR_GAVE', 'UDHAAR_GOT', 'UDHAAR_REPAYMENT'],
      description:
        'EXPENSE = regular spending; INCOME = salary/sales received; UDHAAR_GAVE = lent money/credit given to someone (Lena Hai); UDHAAR_GOT = borrowed money/credit taken from supplier/friend (Dena Hai); UDHAAR_REPAYMENT = partial or full repayment of existing udhaar.',
    },
    extractedRupees: {
      type: Type.NUMBER,
      nullable: true,
      description:
        'Numeric amount in Indian Rupees (e.g., 2000 for "do hazaar"). Null if user did not mention an amount.',
    },
    extractedContactName: {
      type: Type.STRING,
      nullable: true,
      description: 'Person, customer, supplier, or merchant name if mentioned (e.g., "Ravi", "DMart").',
    },
    extractedCategoryName: {
      type: Type.STRING,
      nullable: true,
      description:
        'Suggested category name such as "Grocery & Rashan", "Petrol & Travel", "Chai & Dining", "Bills & Recharge", "Salary & Income", "Dukaan Stock / Maal", or "Counter Bikri (Sales)".',
    },
    extractedDueDate: {
      type: Type.STRING,
      nullable: true,
      description:
        'ISO date YYYY-MM-DD if the user mentions a repayment or due date (e.g., "10 November" -> "2026-11-10"). Null otherwise.',
    },
    paymentVia: {
      type: Type.STRING,
      enum: ['UPI', 'CASH', 'CARD', 'BANK_TRANSFER'],
      description: 'Payment channel mentioned or defaulted to UPI/CASH.',
    },
    description: {
      type: Type.STRING,
      description: 'Short Hinglish summary note of the transaction or udhaar.',
    },
    needsClarification: {
      type: Type.BOOLEAN,
      description:
        'True if critical info is missing or ambiguous (e.g., amount is missing, or user said "Ravi ko 500 diye" without specifying whether it is an expense or udhaar or repayment).',
    },
    ambiguityQuestion: {
      type: Type.STRING,
      nullable: true,
      description:
        'If needsClarification is true, provide a polite, short Hinglish follow-up question asking the user to clarify (e.g., "Kya yeh ₹500 Ravi ko Udhaar diye hain, ya purana udhaar settle kiya hai?"). Null if needsClarification is false.',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'Confidence score between 0.0 and 1.0.',
    },
  },
  required: [
    'transcript',
    'intent',
    'paymentVia',
    'description',
    'needsClarification',
    'confidence',
  ],
};

/**
 * Uses Google Gemini to parse Hindi / Hinglish / English voice audio or text into a structured
 * financial draft. Follows Golden Rule #1: AI only extracts entities; code calculates paise.
 */
export async function parseVoiceOrTextWithGemini(params: {
  utteranceText?: string;
  audioBase64?: string;
  audioMimeType?: string;
  workspaceMode: 'PERSONAL' | 'BUSINESS';
  previousDraftContext?: string;
  clarificationAnswer?: string;
  todayIsoDate: string;
}): Promise<GeminiExtractedDraft> {
  const systemPrompt = `You are FinTrack's multilingual Indian financial voice assistant.
Today's date is ${params.todayIsoDate}. Active workspace mode is ${params.workspaceMode}.
Understand Hindi (Devanagari), Hinglish, and English naturally.
Rules:
1. Extract the exact rupee amount as a number in extractedRupees. Never compute ledger balances yourself.
2. If the user says "Ravi ko 2000 rupaye udhaar diye, woh 10 November ko wapas karega", set intent = "UDHAAR_GAVE", extractedRupees = 2000, extractedContactName = "Ravi", extractedDueDate = "2026-11-10", needsClarification = false.
3. If the user says "Ravi ne 1000 wapas kiye", set intent = "UDHAAR_REPAYMENT", extractedRupees = 1000, extractedContactName = "Ravi", needsClarification = false.
4. If the amount is missing OR if the user says something ambiguous like "Ravi ko 500 diye" where it is unclear if it's UDHAAR_GAVE, UDHAAR_REPAYMENT, or EXPENSE, set needsClarification = true and write a brief, friendly Hinglish question in ambiguityQuestion.`;

  const contents: Array<Record<string, unknown> | string> = [];

  if (params.audioBase64 && params.audioMimeType) {
    contents.push({
      inlineData: {
        data: params.audioBase64,
        mimeType: params.audioMimeType,
      },
    });
  }

  let userPrompt = params.utteranceText
    ? `User spoken utterance: "${params.utteranceText}"`
    : 'Transcribe the attached audio and extract the structured financial draft.';

  if (params.previousDraftContext && params.clarificationAnswer) {
    userPrompt += `\nPrevious context: ${params.previousDraftContext}\nUser's answer to clarification question: "${params.clarificationAnswer}". Now resolve the ambiguity and set needsClarification = false if all required fields (amount & intent) are clear.`;
  }

  contents.push(userPrompt);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: EXTRACTION_SCHEMA,
      temperature: 0.1,
    },
  });

  const rawText = response.text || '{}';
  const parsed = JSON.parse(rawText) as GeminiExtractedDraft;
  return parsed;
}
