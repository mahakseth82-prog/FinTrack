import { GoogleGenAI, Type, Schema } from '@google/genai';
import { env } from '../config/env';
import {
  transcribeAudioWithGroqWhisper,
  extractFinancialEntityWithGroq,
  stripUrduCharacters,
  BAN_URDU_REGEX,
} from './groqWhisperService';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export type LanguagePreference = 'en' | 'hi';

export interface GeminiExtractedDraft {
  transcript: string;
  intent: 'EXPENSE' | 'INCOME' | 'UDHAAR_GAVE' | 'UDHAAR_GOT' | 'UDHAAR_REPAYMENT';
  extractedRupees: number | null;
  extractedContactName: string | null;
  normalized_title: string;
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
      description: 'Exact transcript of what the user said in Latin English or Devanagari Hindi. Strictly NO Urdu script.',
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
        'The exact merchant, person, store, or service explicitly spoken. Never default to random names or Urdu script.',
    },
    normalized_title: {
      type: Type.STRING,
      description:
        'Specific title capturing the exact product, service, or activity spoken (e.g. "Clothes Purchase", "Food / Dinner", "Milk & Bread", "Credit Given - Ravi"). NEVER generic "Entry" or "Expense". Strictly Latin or Devanagari script.',
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
      description: 'Clean summary note of the transaction without any Urdu characters.',
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
    'normalized_title',
    'paymentVia',
    'description',
    'needsClarification',
    'confidence',
  ],
};

export function cleanAndSanitizeScript(
  text: string,
  preferredLanguage: LanguagePreference = 'en'
): string {
  if (!text) return '';
  // Hard ban Urdu / Arabic unicode
  let clean = stripUrduCharacters(text);

  // If preferredLanguage is English and there are stray non-ASCII characters that aren't common punctuation or currency
  if (preferredLanguage === 'en') {
    // If the text was entirely Urdu/Arabic, stripUrduCharacters leaves it empty.
    if (!clean.trim()) {
      return 'Voice Entry';
    }
  }

  return clean.trim();
}

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
 * Strictly avoids generic "Entry" or "Expense" when nouns like "kapde", "doodh", "khana", etc. are present.
 * Strictly bans Urdu script.
 */
export function parseHinglishFallback(
  rawText: string,
  workspaceMode: 'PERSONAL' | 'BUSINESS',
  preferredLanguage: LanguagePreference = 'en'
): GeminiExtractedDraft {
  const sanitizedInput = cleanAndSanitizeScript(rawText, preferredLanguage);
  const normalized = normalizeDevanagariDigits(sanitizedInput.trim());
  const text = normalized;
  const lower = text.toLowerCase();

  // 1. Extract amount
  let extractedRupees: number | null = null;
  const cleanedForNum = lower.replace(/,/g, '');

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

  // 3. Detect Payment Mode
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
    /\b(dudh|doodh|milk|paneer|rashan|grocery|sabzi|subzi|kirana|dmart|aata|atta|dal|oil|bread|egg)\b/.test(
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
    /\b(chai|tea|coffee|samosa|haldiram|food|dinner|lunch|breakfast|zomato|swiggy|restaurant|pizza|burger|snacks|khana|bhojan)\b/.test(
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

  // 5. Specific Spoken Item Detection & Title Generation (STRICT: NO GENERIC "Entry")
  let normalized_title = '';
  let extractedContactName: string | null = null;

  // Person extraction (e.g. "Ravi ko", "Kabir ko", "Client se")
  const personMatch = text.match(
    /^([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+)?)\s+(?:ko|se|ne|ka|ke|ki)\b/i
  );
  if (personMatch) {
    extractedContactName = cleanAndSanitizeScript(personMatch[1], preferredLanguage);
    if (intent === 'UDHAAR_GAVE') {
      normalized_title =
        preferredLanguage === 'hi'
          ? `उधार दिया - ${extractedContactName}`
          : `Credit Given - ${extractedContactName}`;
    } else if (intent === 'UDHAAR_GOT') {
      normalized_title =
        preferredLanguage === 'hi'
          ? `उधार लिया - ${extractedContactName}`
          : `Credit Taken - ${extractedContactName}`;
    } else {
      normalized_title =
        preferredLanguage === 'hi'
          ? `${extractedContactName} को भुगतान`
          : `Paid to ${extractedContactName}`;
    }
  }

  // Specific item detection if no person matched
  if (!normalized_title) {
    if (/\b(kapde|kapda|clothes|shirt|pant|dress|kurta|tshirt)\b/i.test(lower)) {
      normalized_title = preferredLanguage === 'hi' ? 'कपड़े की खरीदारी' : 'Clothes Purchase';
    } else if (/\b(doodh|dudh|milk)\s*(?:aur|and|&)\s*(?:bread|roti|biskut|biscuits?)\b/i.test(lower)) {
      normalized_title = preferredLanguage === 'hi' ? 'दूध और ब्रेड' : 'Milk & Bread';
    } else if (/\b(doodh|dudh|milk|dairy|paneer)\b/i.test(lower)) {
      normalized_title = preferredLanguage === 'hi' ? 'दूध / डेयरी' : 'Dairy / Milk';
    } else if (/\b(khana|bhojan|dinner|lunch|breakfast|food)\b/i.test(lower)) {
      normalized_title = preferredLanguage === 'hi' ? 'खाना / भोजन' : 'Food / Dinner';
    } else if (/\b(petrol|diesel|fuel)\b/i.test(lower)) {
      normalized_title = preferredLanguage === 'hi' ? 'पेट्रोल' : 'Petrol';
    } else if (/\b(dmart|d-mart)\b/i.test(lower)) {
      normalized_title = preferredLanguage === 'hi' ? 'डीमार्ट खरीदारी' : 'DMart Shopping';
    } else if (/\b(chai|tea|samosa|snacks)\b/i.test(lower)) {
      normalized_title = preferredLanguage === 'hi' ? 'चाय और नाश्ता' : 'Chai & Snacks';
    } else if (/\b(client|customer|graahak|grahak)\b/i.test(lower)) {
      normalized_title = preferredLanguage === 'hi' ? 'ग्राहक से भुगतान' : 'Client Payment';
    }
  }

  // If still not identified, derive title from cleaned words or category (NEVER "Entry")
  if (!normalized_title) {
    const cleanedTitle = text
      .replace(/(?:₹|rs\.?|inr)?\s*\d+(?:,\d+)*(?:\.\d{1,2})?/gi, ' ')
      .replace(
        /\b(rupaye|rupees|rs|inr|ka|ki|ke|ko|se|ne|mein|me|par|pe|for|on|at|to|from|paid|spent|given|got|received|udhaar|udhar|diya|diye|liya|liye|wapas|mila|mile|kharch|kharche|kiye|kiya|aaj|kal|via|upi|cash|nagad|gpay|phonepe|paytm|added|add)\b/gi,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanedTitle.length >= 2) {
      normalized_title = cleanedTitle
        .split(' ')
        .slice(0, 3)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      if (!extractedContactName) {
        extractedContactName = normalized_title;
      }
    } else {
      normalized_title =
        preferredLanguage === 'hi'
          ? extractedCategoryName === 'Chai & Dining'
            ? 'खाना / भोजन'
            : extractedCategoryName === 'Grocery & Rashan'
              ? 'राशन / किराना'
              : extractedCategoryName === 'Petrol & Travel'
                ? 'पेट्रोल व यात्रा'
                : 'दैनिक खर्च'
          : extractedCategoryName === 'Chai & Dining'
            ? 'Food / Dining'
            : extractedCategoryName === 'Grocery & Rashan'
              ? 'Groceries / Rashan'
              : extractedCategoryName === 'Petrol & Travel'
                ? 'Petrol & Commute'
                : 'Expense';
    }
  }

  if (!extractedContactName) {
    extractedContactName = normalized_title;
  }

  // Final check: Strip any Urdu characters that may have crept in
  normalized_title = cleanAndSanitizeScript(normalized_title, preferredLanguage);
  extractedContactName = cleanAndSanitizeScript(extractedContactName, preferredLanguage);

  return {
    transcript: text,
    intent,
    extractedRupees,
    extractedContactName,
    normalized_title,
    extractedCategoryName,
    extractedDueDate: null,
    paymentVia,
    description: text,
    needsClarification: extractedRupees === null || extractedRupees <= 0,
    ambiguityQuestion:
      extractedRupees === null || extractedRupees <= 0
        ? preferredLanguage === 'hi'
          ? 'कितने रुपये की एंट्री है? (e.g. "पेट्रोल 300" या "रवि को 500 उधार")'
          : 'Kitne rupaye ki entry hai? (e.g. "Petrol 300" ya "Ravi ko 500 udhaar")'
        : null,
    confidence: 0.92,
  };
}

/**
 * Uses Google Gemini (with primary Groq LLM acceleration) to parse Hindi / Hinglish / English
 * voice audio or text into a structured financial entry.
 * Strictly enforces user's preferred language ('en' | 'hi'), bans Urdu script, and preserves
 * specific items mentioned.
 */
export async function parseVoiceOrTextWithGemini(params: {
  utteranceText?: string;
  audioBase64?: string;
  audioMimeType?: string;
  workspaceMode: 'PERSONAL' | 'BUSINESS';
  preferredLanguage?: LanguagePreference;
  previousDraftContext?: string;
  clarificationAnswer?: string;
  todayIsoDate: string;
}): Promise<GeminiExtractedDraft> {
  const prefLang: LanguagePreference = params.preferredLanguage === 'hi' ? 'hi' : 'en';

  // 1. Transcribe audio if needed using Groq Whisper Large-v3 with language pinning
  let effectiveText = cleanAndSanitizeScript(params.utteranceText?.trim() || '', prefLang);
  if (!effectiveText && params.audioBase64) {
    try {
      const groqTranscript = await transcribeAudioWithGroqWhisper(
        params.audioBase64,
        params.audioMimeType,
        prefLang
      );
      if (groqTranscript) {
        effectiveText = cleanAndSanitizeScript(groqTranscript, prefLang);
      }
    } catch {
      // Continue to multimodal fallback
    }
  }

  // 2. High-speed Groq entity extraction with Urdu ban and item preservation
  if (effectiveText && !params.clarificationAnswer) {
    try {
      const groqExt = await extractFinancialEntityWithGroq(
        effectiveText,
        params.workspaceMode,
        params.todayIsoDate,
        prefLang
      );
      if (groqExt && groqExt.amountRupees > 0) {
        const cleanTitle = cleanAndSanitizeScript(
          groqExt.normalized_title || groqExt.merchantOrPerson || '',
          prefLang
        );
        const cleanPerson = cleanAndSanitizeScript(
          groqExt.merchantOrPerson || cleanTitle || '',
          prefLang
        );

        return {
          transcript: effectiveText,
          intent: groqExt.intent,
          extractedRupees: groqExt.amountRupees,
          extractedContactName: cleanPerson || cleanTitle,
          normalized_title: cleanTitle || cleanPerson || (prefLang === 'hi' ? 'खर्च' : 'Expense'),
          extractedCategoryName: groqExt.category || 'General',
          extractedDueDate: null,
          paymentVia: groqExt.paymentVia || 'CASH',
          description: cleanTitle || effectiveText,
          needsClarification: false,
          ambiguityQuestion: null,
          confidence: 0.98,
        };
      }
    } catch {
      // Fall through to Gemini
    }
  }

  // 3. Fallback to Gemini 2.5 Flash
  const systemPrompt = `You are FinTrack's multilingual Indian financial voice assistant.
Today's date is ${params.todayIsoDate}. Active workspace mode is ${params.workspaceMode}.
The user's preferred language is: ${prefLang} ('en' or 'hi').

CRITICAL SCRIPT & ENTITY RULES:
1. BAN URDU SCRIPT: Output text strictly using English (Latin alphabet) or Hindi (Devanagari alphabet).
   NEVER use Urdu script (Perso-Arabic alphabet). Under NO circumstance should Urdu characters (like اردو) ever be returned.
2. SCRIPT HANDLING:
   - If preferredLanguage === 'en': Output in standard Latin/English. If the user spoke Hindi words, translate or transliterate cleanly into English title-case (e.g., "Kapde" -> "Clothes", "Doodh" -> "Dairy / Milk", "Khana" -> "Food / Dinner").
   - If preferredLanguage === 'hi': Output in clean Devanagari Hindi (e.g., "कपड़े की खरीदारी", "दूध और ब्रेड", "खाना / भोजन").
3. PRESERVE SPECIFIC SPOKEN ITEM: Extract the specific product/service/item spoken by the user for 'normalized_title'.
   Never use generic placeholders like 'Entry', 'Transaction', or 'Expense' when a specific noun (e.g., kapde, khana, petrol, doodh, samaan) is mentioned:
   - "Kapde kharide 1200 ke" -> normalized_title: "Clothes Purchase" (or "कपड़े की खरीदारी")
   - "Khana khaya 350 rupaye" -> normalized_title: "Food / Dinner" (or "खाना / भोजन")
   - "Doodh aur bread 80 rupaye" -> normalized_title: "Milk & Bread" (or "दूध और ब्रेड")
   - "Ravi ko udhaar diya 2000" -> normalized_title: "Credit Given - Ravi" (or "उधार दिया - रवि"), extractedContactName: "Ravi"
   - "Client se payment aayi 5000" -> normalized_title: "Client Payment" (or "ग्राहक से भुगतान")
4. Fall back to category names only if the user did NOT mention any item or person.
5. Whenever a valid amount is present (extractedRupees > 0), ALWAYS set needsClarification = false so the entry is saved automatically.`;

  const contents: Array<Record<string, unknown> | string> = [];

  if (effectiveText) {
    let userPrompt = `User said: "${effectiveText}"`;
    if (params.previousDraftContext && params.clarificationAnswer) {
      userPrompt += `\nPrevious context: ${params.previousDraftContext}\nUser's answer: "${params.clarificationAnswer}". Resolve and set needsClarification = false.`;
    }
    contents.push(userPrompt);
  } else if (params.audioBase64 && params.audioMimeType) {
    contents.push({
      inlineData: {
        data: params.audioBase64,
        mimeType: params.audioMimeType,
      },
    });
    contents.push(
      `Transcribe and extract this financial entry. Preferred language: ${prefLang}. STRICT RULE: NEVER output Urdu script.`
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
      params.workspaceMode,
      prefLang
    );

    const finalRupees =
      parsed.extractedRupees && parsed.extractedRupees > 0
        ? parsed.extractedRupees
        : fallback.extractedRupees;

    const rawTitle = parsed.normalized_title || parsed.extractedContactName || fallback.normalized_title;
    const cleanTitle = cleanAndSanitizeScript(rawTitle, prefLang);
    const cleanContact = cleanAndSanitizeScript(
      parsed.extractedContactName || fallback.extractedContactName || cleanTitle,
      prefLang
    );

    return {
      transcript: cleanAndSanitizeScript(parsed.transcript || params.utteranceText || 'Voice Entry', prefLang),
      intent: parsed.intent || fallback.intent,
      extractedRupees: finalRupees,
      extractedContactName: cleanContact,
      normalized_title: cleanTitle || (prefLang === 'hi' ? 'खर्च' : 'Expense'),
      extractedCategoryName:
        parsed.extractedCategoryName || fallback.extractedCategoryName || 'General',
      extractedDueDate: parsed.extractedDueDate || null,
      paymentVia: parsed.paymentVia || fallback.paymentVia || 'UPI',
      description:
        cleanAndSanitizeScript(parsed.description || cleanTitle, prefLang),
      needsClarification: !finalRupees || finalRupees <= 0,
      ambiguityQuestion:
        !finalRupees || finalRupees <= 0
          ? prefLang === 'hi'
            ? 'कितने रुपये की एंट्री है? (e.g. "पेट्रोल 300" या "रवि को 500 उधार")'
            : 'Kitne rupaye ki entry hai? (e.g. "Petrol 300" ya "Ravi ko 500 udhaar")'
          : null,
      confidence: parsed.confidence ?? 0.95,
    };
  } catch (err) {
    console.error('⚠️ [Gemini Voice Parsing Error]:', err);
    if (params.utteranceText && params.utteranceText.trim()) {
      return parseHinglishFallback(
        params.utteranceText.trim(),
        params.workspaceMode,
        prefLang
      );
    }
    throw new Error(
      err instanceof Error
        ? `Voice processing error: ${err.message}`
        : 'Could not process voice entry'
    );
  }
}
