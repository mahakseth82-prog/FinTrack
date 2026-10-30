import { GoogleGenAI, Type, Schema } from '@google/genai';
import { env } from '../config/env';
import {
  transcribeAudioWithGroqWhisper,
  extractFinancialEntityWithGroq,
} from './groqWhisperService';

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
        'Numeric amount in Indian Rupees (e.g., 2000 for "do hazaar"). Null only if user did not mention any number/amount.',
    },
    extractedContactName: {
      type: Type.STRING,
      nullable: true,
      description:
        'The exact merchant, item, person, or service explicitly spoken by the user. Never hallucinate or default to random names.',
    },
    extractedCategoryName: {
      type: Type.STRING,
      nullable: true,
      description:
        'Suggested category name: "Grocery & Rashan", "Petrol & Travel", "Chai & Dining", "Bills & Recharge", "Salary & Income", "Dukaan Stock / Maal", "Counter Bikri (Sales)", or "General".',
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
      description: 'Payment channel mentioned or defaulted to UPI.',
    },
    description: {
      type: Type.STRING,
      description: 'Short Hinglish summary note of the transaction or udhaar.',
    },
    needsClarification: {
      type: Type.BOOLEAN,
      description:
        'Set to FALSE whenever an amount is present so the entry can save automatically. Only set TRUE if no amount at all was mentioned.',
    },
    ambiguityQuestion: {
      type: Type.STRING,
      nullable: true,
      description: 'Null when needsClarification is false.',
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

export function normalizeDevanagariDigits(input: string): string {
  const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  let res = input;
  devanagariDigits.forEach((d, idx) => {
    res = res.split(d).join(idx.toString());
  });
  return res;
}

/**
 * Smart deterministic Hinglish / Hindi / English parser fallback.
 * Guarantees instant automatic extraction & saving even if Gemini API is offline or rate-limited,
 * and fills in any missing merchant/category defaults.
 */
export function parseHinglishFallback(
  rawText: string,
  workspaceMode: 'PERSONAL' | 'BUSINESS'
): GeminiExtractedDraft {
  const normalized = normalizeDevanagariDigits(rawText.trim());
  const text = normalized;
  const lower = text.toLowerCase();

  // 1. Extract amount (supports digits like "2,000", "500.50", "1.5k", Devanagari numerals, and Hindi number words)
  let extractedRupees: number | null = null;
  const cleanedForNum = lower.replace(/,/g, '');

  // Check for 'k' notation (e.g. 1.5k -> 1500, 2k -> 2000)
  const kMatch = cleanedForNum.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    extractedRupees = Math.round(Number(kMatch[1]) * 1000);
  } else {
    const numMatch = cleanedForNum.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)/i);
    if (numMatch) {
      extractedRupees = Number(numMatch[1]);
    } else {
      const wordMap: Array<[RegExp, number]> = [
        [/\b(?:do|2)\s*(?:hazaar|hazar|हज़ार|हजार)\b/, 2000],
        [/\b(?:panch|paanch|5)\s*(?:hazaar|hazar|हज़ार|हजार)\b/, 5000],
        [/\b(?:das|10)\s*(?:hazaar|hazar|हज़ार|हजार)\b/, 10000],
        [/\b(?:ek|1)\s*(?:hazaar|hazar|हज़ार|हजार)\b|\b(?:hazaar|hazar|हज़ार|हजार)\b/, 1000],
        [/\b(?:panch|paanch|5)\s*(?:sau|सौ)\b/, 500],
        [/\b(?:chaar|4)\s*(?:sau|सौ)\b/, 400],
        [/\b(?:teen|3)\s*(?:sau|सौ)\b/, 300],
        [/\b(?:do|2)\s*(?:sau|सौ)\b/, 200],
        [/\b(?:dhai|dhhai)\s*(?:sau|सौ)\b/, 250],
        [/\b(?:dedh|derh)\s*(?:sau|सौ)\b/, 150],
        [/\b(?:sau|सौ)\b|\b(?:ek|1)\s*(?:sau|सौ)\b/, 100],
        [/\b(?:pachaas|pachas|पचास)\b/, 50],
        [/\b(?:tees|तीस)\b/, 30],
        [/\b(?:bees|बीस)\b/, 20],
        [/\b(?:das|दस)\b/, 10],
      ];
      for (const [regex, val] of wordMap) {
        if (regex.test(lower)) {
          extractedRupees = val;
          break;
        }
      }
    }
  }

  // 2. Detect Intent
  let intent: GeminiExtractedDraft['intent'] = 'EXPENSE';
  if (
    /\b(wapas\s*mil|wapas\s*kiy|wapas\s*diya|repay|settled?|vasool|lauta|returned)\b/.test(
      lower
    )
  ) {
    intent = 'UDHAAR_REPAYMENT';
  } else if (
    /\b(udhaar\s*liya|udhar\s*liya|udhaar\s*liye|borrowed|dena\s*hai|maal\s*udhaar)\b/.test(
      lower
    )
  ) {
    intent = 'UDHAAR_GOT';
  } else if (
    /\b(udhaar|udhar|lena\s*hai|lent|credit\s*diya|khata\s*mein|khate\s*mein)\b/.test(
      lower
    )
  ) {
    intent = 'UDHAAR_GAVE';
  } else if (
    /\b(salary|kamaai|kamai|income|received|mila|mile|bikri|sales|bonus|credit\s*hua|aaye|aaya)\b/.test(
      lower
    )
  ) {
    intent = 'INCOME';
  } else {
    intent = 'EXPENSE';
  }

  // 3. Detect Payment Mode (Default to CASH for voice/manual entries unless UPI/Card/Bank mentioned)
  let paymentVia: GeminiExtractedDraft['paymentVia'] = 'CASH';
  if (/\b(upi|gpay|phonepe|paytm|bhim|online)\b/.test(lower)) {
    paymentVia = 'UPI';
  } else if (/\b(bank|neft|rtgs|imps|transfer)\b/.test(lower)) {
    paymentVia = 'BANK_TRANSFER';
  } else if (/\b(card|credit\s*card|debit\s*card)\b/.test(lower)) {
    paymentVia = 'CARD';
  }

  // 4. Detect Category
  let extractedCategoryName =
    workspaceMode === 'BUSINESS'
      ? intent === 'INCOME'
        ? 'Counter Bikri (Sales)'
        : 'Dukaan Stock / Maal'
      : intent === 'INCOME'
        ? 'Salary & Income'
        : 'General';

  if (
    /\b(dudh|milk|paneer|rashan|grocery|sabzi|subzi|kirana|dmart|aata|atta|dal|oil|bread|egg)\b/.test(
      lower
    )
  ) {
    extractedCategoryName = 'Grocery & Rashan';
  } else if (
    /\b(petrol|diesel|fuel|auto|cab|uber|ola|metro|train|bus|travel|parking|toll)\b/.test(
      lower
    )
  ) {
    extractedCategoryName = 'Petrol & Travel';
  } else if (
    /\b(chai|tea|coffee|samosa|haldiram|food|dinner|lunch|breakfast|zomato|swiggy|restaurant|pizza|burger|snacks)\b/.test(
      lower
    )
  ) {
    extractedCategoryName = 'Chai & Dining';
  } else if (
    /\b(bill|recharge|wifi|jio|airtel|bijli|electricity|rent|cylinder|gas|water)\b/.test(
      lower
    )
  ) {
    extractedCategoryName = 'Bills & Recharge';
  } else if (/\b(salary|stipend|bonus|freelance)\b/.test(lower)) {
    extractedCategoryName = 'Salary & Income';
  }

  // 5. Extract Clean Merchant / Person Title without asking the user on another page
  let extractedContactName: string | null = null;
  const personMatch = text.match(
    /^([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+)?)\s+(?:ko|se|ne|ka|ke|ki)\b/i
  );
  if (personMatch) {
    extractedContactName = personMatch[1].trim();
  } else {
    // Strip numbers, currency words, and common filler verbs to derive a clean Merchant/Item title
    const cleanedTitle = text
      .replace(/(?:₹|rs\.?|inr)?\s*\d+(?:,\d+)*(?:\.\d{1,2})?/gi, ' ')
      .replace(
        /\b(rupaye|rupees|rs|inr|ka|ki|ke|ko|se|ne|mein|me|par|pe|for|on|at|to|from|paid|spent|given|got|received|udhaar|udhar|diya|diye|liya|liye|wapas|mila|mile|kharch|kharche|kiye|kiya|aaj|kal|via|upi|cash|nagad|gpay|phonepe|paytm|added|add)\b/gi,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanedTitle.length >= 2) {
      extractedContactName = cleanedTitle
        .split(' ')
        .slice(0, 3)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    } else {
      extractedContactName = extractedCategoryName.split(' ')[0] || 'Entry';
    }
  }

  return {
    transcript: text,
    intent,
    extractedRupees,
    extractedContactName,
    extractedCategoryName,
    extractedDueDate: null,
    paymentVia,
    description: text,
    needsClarification: extractedRupees === null || extractedRupees <= 0,
    ambiguityQuestion:
      extractedRupees === null || extractedRupees <= 0
        ? 'Kitne rupaye ki entry hai? (e.g. "Petrol 300" ya "Ravi ko 500 udhaar")'
        : null,
    confidence: 0.92,
  };
}

/**
 * Uses Google Gemini to parse Hindi / Hinglish / English voice audio or text into a structured
 * financial entry, with automatic fallback to `parseHinglishFallback` so it never fails.
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
  // 1. If audio is provided, first try transcribing with Groq Whisper Large-v3 for maximum accuracy
  let effectiveText = params.utteranceText?.trim() || '';
  if (!effectiveText && params.audioBase64) {
    try {
      const groqTranscript = await transcribeAudioWithGroqWhisper(
        params.audioBase64,
        params.audioMimeType
      );
      if (groqTranscript) {
        effectiveText = groqTranscript;
      }
    } catch {
      // Continue to Gemini multimodal fallback
    }
  }

  // 2. High-speed Groq entity extraction (bypasses Gemini rate limits & avoids hallucination)
  if (effectiveText && !params.clarificationAnswer) {
    try {
      const groqExt = await extractFinancialEntityWithGroq(
        effectiveText,
        params.workspaceMode,
        params.todayIsoDate
      );
      if (groqExt && groqExt.amountRupees > 0) {
        return {
          transcript: effectiveText,
          intent: groqExt.intent,
          extractedRupees: groqExt.amountRupees,
          extractedContactName: groqExt.merchantOrPerson || 'Entry',
          extractedCategoryName: groqExt.category || 'General',
          extractedDueDate: null,
          paymentVia: groqExt.paymentVia || 'CASH',
          description: effectiveText,
          needsClarification: false,
          ambiguityQuestion: null,
          confidence: 0.98,
        };
      }
    } catch {
      // Fall through to Gemini
    }
  }

  const systemPrompt = `You are FinTrack's multilingual Indian financial voice assistant.
Today's date is ${params.todayIsoDate}. Active workspace mode is ${params.workspaceMode}.
Understand Hindi (Devanagari), Hinglish, and English naturally.
Rules:
1. Extract the exact rupee amount as a numeric value in extractedRupees.
2. STRICT ACCURACY FOR NAMES: In extractedContactName, extract ONLY the exact merchant, person, store, or item explicitly mentioned by the user. NEVER invent, assume, or default to any names. If no person or store is mentioned (e.g. "Petrol 300"), use the expense title ("Petrol").
3. Whenever a valid amount is present (extractedRupees > 0), ALWAYS set needsClarification = false so the entry is saved automatically.
4. Default intent to "EXPENSE" unless the user mentions salary/income ("INCOME"), giving udhaar ("UDHAAR_GAVE"), taking udhaar ("UDHAAR_GOT"), or udhaar repayment ("UDHAAR_REPAYMENT").`;

  const contents: Array<Record<string, unknown> | string> = [];

  // If we already have high-accuracy transcript from Groq Whisper or user text, send text prompt
  if (effectiveText) {
    let userPrompt = `User said: "${effectiveText}"`;
    if (params.previousDraftContext && params.clarificationAnswer) {
      userPrompt += `\nPrevious context: ${params.previousDraftContext}\nUser's answer: "${params.clarificationAnswer}". Resolve and set needsClarification = false.`;
    }
    contents.push(userPrompt);
  } else if (params.audioBase64 && params.audioMimeType) {
    // Multimodal audio fallback to Gemini directly
    contents.push({
      inlineData: {
        data: params.audioBase64,
        mimeType: params.audioMimeType,
      },
    });
    contents.push(
      'Transcribe this Hindi/Hinglish/English audio and extract the structured financial entry. Extract ONLY the exact names spoken.'
    );
  } else {
    throw new Error('No voice audio or text provided');
  }

  try {
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
    const fallback = parseHinglishFallback(
      parsed.transcript || params.utteranceText || '',
      params.workspaceMode
    );

    const finalRupees =
      parsed.extractedRupees && parsed.extractedRupees > 0
        ? parsed.extractedRupees
        : fallback.extractedRupees;

    return {
      transcript: parsed.transcript || params.utteranceText || 'Voice Entry',
      intent: parsed.intent || fallback.intent,
      extractedRupees: finalRupees,
      extractedContactName:
        parsed.extractedContactName || fallback.extractedContactName || 'Entry',
      extractedCategoryName:
        parsed.extractedCategoryName || fallback.extractedCategoryName || 'General',
      extractedDueDate: parsed.extractedDueDate || null,
      paymentVia: parsed.paymentVia || fallback.paymentVia || 'UPI',
      description:
        parsed.description ||
        parsed.transcript ||
        params.utteranceText ||
        'Voice Entry',
      needsClarification: !finalRupees || finalRupees <= 0,
      ambiguityQuestion:
        !finalRupees || finalRupees <= 0
          ? 'Kitne rupaye ki entry hai? (e.g. "Petrol 300" ya "Ravi ko 500 udhaar")'
          : null,
      confidence: parsed.confidence ?? 0.95,
    };
  } catch (err) {
    console.error('⚠️ [Gemini Voice Parsing Error]:', err);
    // If Gemini API fails (e.g. quota, network, audio issue) and we have utteranceText, use deterministic Hinglish fallback
    if (params.utteranceText && params.utteranceText.trim()) {
      return parseHinglishFallback(
        params.utteranceText.trim(),
        params.workspaceMode
      );
    }
    throw new Error(
      err instanceof Error
        ? `Voice processing error: ${err.message}`
        : 'Could not process voice entry'
    );
  }
}
