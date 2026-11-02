import { GoogleGenAI, Type, Schema } from '@google/genai';
import { env } from '../config/env';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export type DocumentVaultType =
  | 'BILL'
  | 'INVOICE'
  | 'INSURANCE'
  | 'WARRANTY'
  | 'RC_BOOK'
  | 'OTHER';

export interface VaultDocAnalysisResult {
  title: string;
  docType: DocumentVaultType;
  expiryDate: string | null; // strictly YYYY-MM-DD
  policyOrIdNumber: string | null;
  provider: string | null;
  emergencyHelpline: string | null;
  summary: string;
  confidence: number;
}

const VAULT_DOCUMENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description:
        'Formal document title (e.g. "HDFC ERGO Car Insurance Policy", "Voltas Split AC Warranty", "Hyundai Creta RC Book", "Reliance Retail Invoice")',
    },
    doc_type: {
      type: Type.STRING,
      enum: ['INSURANCE', 'WARRANTY', 'BILL', 'RC_BOOK', 'INVOICE', 'OTHER'],
      description:
        'Classification: INSURANCE for health/motor/life policies, WARRANTY for product guarantees, BILL for retail receipts, RC_BOOK for vehicle registration/pollution/fitness, INVOICE for business/tax invoices, OTHER for general certificates/records.',
    },
    expiry_date: {
      type: Type.STRING,
      nullable: true,
      description:
        'Document expiration or policy renewal date formatted strictly as YYYY-MM-DD (e.g. searches for "Valid Till", "Period of Insurance To", "Renewal Due", "Expiry Date", "Fitness Valid Upto"). If missing or indefinite, return null.',
    },
    policy_or_id_number: {
      type: Type.STRING,
      nullable: true,
      description:
        'Policy number, warranty registration, vehicle registration number, or invoice number if clearly printed, otherwise null.',
    },
    provider: {
      type: Type.STRING,
      nullable: true,
      description:
        'Company, brand, insurance underwriter, or issuing authority name, otherwise null.',
    },
    emergency_helpline: {
      type: Type.STRING,
      nullable: true,
      description:
        'Claims toll-free helpline, 24x7 customer support number, or roadside assistance phone number if printed on document, otherwise null.',
    },
  },
  required: ['title', 'doc_type', 'expiry_date'],
};

/**
 * Uses Gemini 2.5 Flash to inspect document photos or PDFs and automatically
 * classify doc_type, suggest a clean formal title, extract expiry/renewal date,
 * and capture emergency contact/policy identifiers.
 */
export async function analyzeVaultDocumentWithGemini(params: {
  fileBase64: string;
  mimeType: string;
}): Promise<VaultDocAnalysisResult> {
  try {
    const promptText = `Analyze this uploaded document or certificate image.
Extract:
1. title: Clean, descriptive formal name including company/item (e.g., "HDFC ERGO Car Insurance Policy", "LG Refrigerator 10-Yr Compressor Warranty", "Tata Power Electricity Bill")
2. doc_type: Must be one of ["INSURANCE", "WARRANTY", "BILL", "RC_BOOK", "INVOICE", "OTHER"]
3. expiry_date: Expiration or policy renewal date formatted strictly as "YYYY-MM-DD" (look for "Valid Till", "Period of Insurance To", "Renewal Due Date", "Expiry Date", "Fitness Valid Upto", etc.). Return null if absent.
4. policy_or_id_number: Policy number / registration / serial number (or null)
5. provider: Insurer or issuing company name (or null)
6. emergency_helpline: Customer care or claims toll-free number (or null)
Output JSON strictly according to the schema.`;

    const modelCall = ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: params.fileBase64,
            mimeType: params.mimeType,
          },
        },
        promptText,
      ],
      config: {
        systemInstruction:
          'You are an expert document parser for Indian physical records (vehicle insurance, health insurance, warranty cards, RC books, bills, and invoices). Extract clean titles, accurate expiration/renewal dates in YYYY-MM-DD format, policy numbers, and emergency phone numbers.',
        responseMimeType: 'application/json',
        responseSchema: VAULT_DOCUMENT_SCHEMA,
        temperature: 0.1,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Document analysis timed out after 18s')), 18000)
    );

    const response = await Promise.race([modelCall, timeoutPromise]);
    const rawText = response.text || '{}';
    const parsed = JSON.parse(rawText);

    // Validate doc_type
    const validDocTypes: DocumentVaultType[] = [
      'INSURANCE',
      'WARRANTY',
      'BILL',
      'RC_BOOK',
      'INVOICE',
      'OTHER',
    ];
    const docType: DocumentVaultType = validDocTypes.includes(parsed.doc_type)
      ? (parsed.doc_type as DocumentVaultType)
      : 'OTHER';

    // Validate and normalize expiry_date (YYYY-MM-DD)
    let expiryDate: string | null = null;
    if (parsed.expiry_date && typeof parsed.expiry_date === 'string') {
      const trimmed = parsed.expiry_date.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        expiryDate = trimmed;
      }
    }

    const title =
      parsed.title && typeof parsed.title === 'string' && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : `${docType.charAt(0) + docType.slice(1).toLowerCase()} Document`;

    return {
      title,
      docType,
      expiryDate,
      policyOrIdNumber: parsed.policy_or_id_number || null,
      provider: parsed.provider || null,
      emergencyHelpline: parsed.emergency_helpline || null,
      summary: `Analyzed as ${docType} with ${expiryDate ? `expiry ${expiryDate}` : 'no expiry'}`,
      confidence: expiryDate ? 0.95 : 0.85,
    };
  } catch (err: unknown) {
    console.warn('⚠️ Gemini document vault analysis error:', err);
    return {
      title: `Document ${new Date().toLocaleDateString('en-IN')}`,
      docType: 'OTHER',
      expiryDate: null,
      policyOrIdNumber: null,
      provider: null,
      emergencyHelpline: null,
      summary: 'Analysis fallback',
      confidence: 0.2,
    };
  }
}
