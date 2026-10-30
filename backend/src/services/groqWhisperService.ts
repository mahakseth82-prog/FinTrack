import fs from 'fs';
import path from 'path';
import os from 'os';
import Groq from 'groq-sdk';
import { env } from '../config/env';

let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  const key = process.env.GROQ_API_KEY || env.GROQ_API_KEY;
  if (!key || !key.startsWith('gsk_')) {
    return null;
  }
  if (!groqClient) {
    groqClient = new Groq({ apiKey: key });
  }
  return groqClient;
}

/**
 * Regex to detect and eliminate any Arabic / Urdu (Perso-Arabic) script characters.
 * Covers standard Arabic, Arabic Supplement, Extended-A, and Presentation Forms.
 */
export const BAN_URDU_REGEX =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

export function stripUrduCharacters(input: string): string {
  if (!input) return '';
  return input.replace(BAN_URDU_REGEX, '').trim();
}

/**
 * Transcribes Hindi / Hinglish / English audio using Groq Whisper Large-v3.
 * Strictly forces Devanagari (Hindi) or Latin (English) alphabet based on user language preference.
 * Explicitly forbids Urdu script.
 */
export async function transcribeAudioWithGroqWhisper(
  audioBase64: string,
  audioMimeType: string = 'audio/m4a',
  preferredLanguage: 'en' | 'hi' = 'en'
): Promise<string | null> {
  const groq = getGroqClient();
  if (!groq) {
    return null;
  }

  // Determine appropriate file extension based on MIME type
  let ext = '.m4a';
  if (audioMimeType.includes('webm')) ext = '.webm';
  else if (audioMimeType.includes('wav')) ext = '.wav';
  else if (audioMimeType.includes('mp3')) ext = '.mp3';
  else if (audioMimeType.includes('mp4')) ext = '.mp4';
  else if (audioMimeType.includes('ogg')) ext = '.ogg';

  const tempFilePath = path.join(
    os.tmpdir(),
    `fintrack-voice-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`
  );

  try {
    const buffer = Buffer.from(audioBase64, 'base64');
    await fs.promises.writeFile(tempFilePath, buffer);

    const fileStream = fs.createReadStream(tempFilePath);

    // Prompt priming Whisper in the correct script with numbers to guarantee digit transcription
    const prompt =
      preferredLanguage === 'hi'
        ? 'पेट्रोल, खाना, कपड़े, दूध, राशन, डीमार्ट, चाय, किराना, उधार, रुपये, ₹, नकद, यूपीआई, 100, 200, 300, 400, 500, 800, 1000, 1200, 1500, 2000, 2200, 4500, 5000, 7500'
        : 'Petrol, Clothes, Food, Milk, Groceries, DMart, Swiggy, Zomato, Chai, Kirana, Udhaar, Rupees, ₹, UPI, Cash, GPay, PhonePe, 100, 200, 300, 500, 800, 1000, 1200, 1500, 2000, 2200, 4500, 5000';

    const transcription = await groq.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-large-v3',
      language: preferredLanguage === 'hi' ? 'hi' : 'en',
      prompt,
      temperature: 0.0,
      response_format: 'json',
    });

    const rawText = transcription.text?.trim() || null;
    if (!rawText) return null;

    // Strict Urdu ban sanitization
    const sanitized = stripUrduCharacters(rawText);
    return sanitized || rawText;
  } catch (err) {
    console.warn('⚠️ [Groq Whisper Transcription Failed - falling back]:', err);
    return null;
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
      }
    } catch {
      // Ignore cleanup error
    }
  }
}

export interface GroqFinancialExtraction {
  intent: 'EXPENSE' | 'INCOME' | 'UDHAAR_GAVE' | 'UDHAAR_GOT' | 'UDHAAR_REPAYMENT';
  amountRupees: number;
  merchantOrPerson: string;
  normalized_title: string;
  category: string;
  paymentVia: 'UPI' | 'CASH' | 'CARD' | 'BANK_TRANSFER';
}

/**
 * Extracts structured financial fields from Hindi / Hinglish / English text using Groq LLM.
 * Strictly adheres to preferredLanguage ('en' or 'hi'), bans Urdu script, and preserves
 * specific items mentioned (never defaults to generic 'Entry' or 'Expense').
 */
export async function extractFinancialEntityWithGroq(
  text: string,
  workspaceMode: 'PERSONAL' | 'BUSINESS',
  todayIsoDate: string,
  preferredLanguage: 'en' | 'hi' = 'en'
): Promise<GroqFinancialExtraction | null> {
  const groq = getGroqClient();
  if (!groq) {
    return null;
  }

  // Pre-strip any incoming Urdu characters
  const cleanedInput = stripUrduCharacters(text);

  const systemPrompt = `You are FinTrack's financial entity parser for India.
Today's date is ${todayIsoDate}. Workspace mode is ${workspaceMode}.
The user's preferred language is: ${preferredLanguage} ('en' or 'hi').

CRITICAL RULES:
1. BAN URDU SCRIPT: Output text strictly using English (Latin alphabet) or Hindi (Devanagari alphabet). NEVER use Urdu script (Perso-Arabic alphabet) under any circumstance.
2. HINDI NUMBER FETCHING: Accurately parse Hindi and English number words into numeric 'amountRupees':
   - "बारह सौ" -> 1200
   - "बाईस सौ" -> 2200
   - "साढ़े चार हजार" -> 4500
   - "सात हजार पांच सौ" -> 7500
   - "पंद्रह सौ" -> 1500
   - "आठ सौ" -> 800
   - "डेढ़ सौ" -> 150
   - "ढाई सौ" -> 250
   - "सवा सौ" -> 125
   - "चार सौ" -> 400
   - "दो हजार" -> 2000
   - "पांच हजार" -> 5000
3. PRESERVE SPECIFIC SPOKEN ITEM: Extract the specific product, service, item, or person spoken by the user for 'normalized_title'.
   Never use generic placeholders like 'Entry', 'Transaction', or 'Expense' when a specific noun (e.g., kapde, khana, petrol, doodh, samaan, ticket, recharge) is mentioned.
4. TITLE GENERATION:
   - If preferredLanguage === 'en':
     - "Kapde kharide 1200 ke" -> normalized_title: "Clothes Purchase"
     - "Khana khaya 350 rupaye" -> normalized_title: "Food / Dinner"
     - "Doodh aur bread 80 rupaye" -> normalized_title: "Milk & Bread"
     - "Petrol bharwaya 500" -> normalized_title: "Petrol"
     - "Ravi ko udhaar diya 2000" -> normalized_title: "Credit Given - Ravi", merchantOrPerson: "Ravi"
     - "Client se payment aayi 5000" -> normalized_title: "Client Payment"
     - "Kabir ko 4500 udhaar diye" -> normalized_title: "Credit Given - Kabir", merchantOrPerson: "Kabir"
   - If preferredLanguage === 'hi':
     - "Kapde kharide 1200 ke" -> normalized_title: "कपड़े की खरीदारी"
     - "Khana khaya 350 rupaye" -> normalized_title: "खाना / भोजन"
     - "Doodh aur bread 80 rupaye" -> normalized_title: "दूध और ब्रेड"
     - "Petrol bharwaya 500" -> normalized_title: "पेट्रोल"
     - "Ravi ko udhaar diya 2000" -> normalized_title: "उधार दिया - रवि", merchantOrPerson: "रवि"
     - "Client se payment aayi 5000" -> normalized_title: "ग्राहक से भुगतान"
     - "Kabir ko 4500 udhaar diye" -> normalized_title: "उधार दिया - कबीर", merchantOrPerson: "कबीर"
5. Fall back to category names (e.g., "Dining", "Groceries") only if the user did NOT mention any item or person (e.g., user only said "300 rupaye kharch kiye").

Output strictly JSON:
{
  "intent": "EXPENSE" | "INCOME" | "UDHAAR_GAVE" | "UDHAAR_GOT" | "UDHAAR_REPAYMENT",
  "amountRupees": number,
  "merchantOrPerson": string,
  "normalized_title": string,
  "category": string,
  "paymentVia": "UPI" | "CASH" | "CARD" | "BANK_TRANSFER"
}`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: cleanedInput,
        },
      ],
      model: 'openai/gpt-oss-120b',
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as GroqFinancialExtraction;

    // Post-sanitize: clean any rogue Urdu characters
    parsed.merchantOrPerson = stripUrduCharacters(parsed.merchantOrPerson || '');
    parsed.normalized_title = stripUrduCharacters(parsed.normalized_title || '');
    parsed.category = stripUrduCharacters(parsed.category || '');

    // Ensure normalized_title is never a generic placeholder
    if (
      !parsed.normalized_title ||
      parsed.normalized_title.toLowerCase() === 'entry' ||
      parsed.normalized_title.toLowerCase() === 'expense' ||
      parsed.normalized_title.toLowerCase() === 'transaction'
    ) {
      parsed.normalized_title =
        parsed.merchantOrPerson ||
        parsed.category ||
        (preferredLanguage === 'hi' ? 'खर्च' : 'Expense');
    }

    return parsed;
  } catch (err) {
    console.warn('⚠️ [Groq Financial Extraction Failed - falling back]:', err);
    return null;
  }
}
