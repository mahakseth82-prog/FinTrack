import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { analyzeVaultDocumentWithGemini } from '../services/geminiVaultService';

const router = Router();

export type DocumentVaultType =
  | 'BILL'
  | 'INVOICE'
  | 'INSURANCE'
  | 'WARRANTY'
  | 'RC_BOOK'
  | 'OTHER';

export interface DocumentVaultDto {
  id: string;
  userId: string;
  workspaceId: string;
  title: string;
  docType: DocumentVaultType;
  fileUrl: string;
  filePath: string | null;
  expiryDate: string | null;
  linkedTransactionId: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/v1/vault
 * Lists documents stored in the Digital Document Vault for the active workspace.
 */
router.get(
  '/vault',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        res.status(400).json({ error: 'X-Workspace-Id header is required' });
        return;
      }

      const { docType, search } = req.query;

      let query = req.db!
        .from('documents_vault')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('user_id', req.userId!)
        .order('created_at', { ascending: false });

      if (docType && typeof docType === 'string' && docType !== 'ALL') {
        query = query.eq('doc_type', docType.toUpperCase());
      }

      if (search && typeof search === 'string' && search.trim()) {
        query = query.ilike('title', `%${search.trim()}%`);
      }

      const { data: rows, error } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Generate secure signed URLs for each private document
      const documents: DocumentVaultDto[] = await Promise.all(
        (rows || []).map(async (row) => {
          let secureUrl = row.file_url;
          if (row.file_path) {
            try {
              const { data: signed } = await supabaseAdmin.storage
                .from('documents-vault')
                .createSignedUrl(row.file_path, 3600);
              if (signed?.signedUrl) {
                secureUrl = signed.signedUrl;
              }
            } catch {
              // fallback to row.file_url
            }
          }

          return {
            id: row.id,
            userId: row.user_id,
            workspaceId: row.workspace_id,
            title: row.title,
            docType: row.doc_type,
            fileUrl: secureUrl,
            filePath: row.file_path,
            expiryDate: row.expiry_date,
            linkedTransactionId: row.linked_transaction_id,
            metadata: row.metadata,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        })
      );

      res.json({ documents });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch vault documents';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/v1/vault/analyze-document
 * Runs Gemini 2.5 Flash OCR over an uploaded document or physical record,
 * auto-classifying doc_type, extracting expiry/renewal date, and detecting policy identifiers.
 */
router.post(
  '/vault/analyze-document',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fileBase64, mimeType = 'image/jpeg' } = req.body;

      if (!fileBase64) {
        res.status(400).json({ error: 'fileBase64 payload is required' });
        return;
      }

      const analysis = await analyzeVaultDocumentWithGemini({
        fileBase64,
        mimeType,
      });

      res.status(200).json({
        success: true,
        analysis,
      });
    } catch (err: unknown) {
      console.warn('Document analysis error:', err);
      res.status(200).json({
        success: false,
        analysis: {
          title: `Document ${new Date().toLocaleDateString('en-IN')}`,
          docType: 'OTHER',
          expiryDate: null,
          policyOrIdNumber: null,
          provider: null,
          emergencyHelpline: null,
          summary: 'Analysis unavailable',
          confidence: 0,
        },
      });
    }
  }
);

/**
 * POST /api/v1/vault
 * Uploads a document (image/PDF base64) to Supabase Storage and records it in `documents_vault`.
 */
router.post(
  '/vault',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        res.status(400).json({ error: 'X-Workspace-Id header is required' });
        return;
      }

      const {
        title,
        docType = 'BILL',
        fileBase64,
        mimeType = 'image/jpeg',
        fileUrl: existingUrl,
        filePath: existingPath,
        expiryDate,
        linkedTransactionId,
        metadata = {},
      } = req.body;

      if (!title || !title.trim()) {
        res.status(400).json({ error: 'Document title is required.' });
        return;
      }

      let filePath: string | null = existingPath || null;
      let secureUrl: string = existingUrl || '';

      // Upload file to Supabase Storage if base64 data is provided
      if (fileBase64) {
        const ext = mimeType.includes('pdf') ? 'pdf' : 'jpg';
        const fileName = `${req.userId}/${Date.now()}_${title
          .trim()
          .replace(/[^a-zA-Z0-9]/g, '_')
          .slice(0, 30)}.${ext}`;

        const buffer = Buffer.from(fileBase64, 'base64');
        const { error: uploadErr } = await supabaseAdmin.storage
          .from('documents-vault')
          .upload(fileName, buffer, {
            contentType: mimeType,
            upsert: true,
          });

        if (uploadErr) {
          console.warn('Storage upload error:', uploadErr.message);
          // If storage fails, still keep a placeholder or return error
        } else {
          filePath = fileName;
          const { data: signed } = await supabaseAdmin.storage
            .from('documents-vault')
            .createSignedUrl(fileName, 86400); // 24h signed URL
          if (signed?.signedUrl) {
            secureUrl = signed.signedUrl;
          }
        }
      }

      // If no file was uploaded and no URL, generate a fallback data URL or path
      if (!secureUrl && fileBase64) {
        secureUrl = `data:${mimeType};base64,${fileBase64.slice(0, 50)}...`;
      }

      const normalizedDocType = [
        'BILL',
        'INVOICE',
        'INSURANCE',
        'WARRANTY',
        'RC_BOOK',
        'OTHER',
      ].includes(String(docType).toUpperCase())
        ? String(docType).toUpperCase()
        : 'OTHER';

      let insertResult = await req.db!
        .from('documents_vault')
        .insert({
          user_id: req.userId!,
          workspace_id: workspaceId,
          title: title.trim(),
          doc_type: normalizedDocType,
          file_url: secureUrl,
          file_path: filePath,
          expiry_date: expiryDate ? String(expiryDate).slice(0, 10) : null,
          linked_transaction_id: linkedTransactionId || null,
          metadata,
        })
        .select('*')
        .single();

      // Graceful schema resilience: If file_path column is not yet refreshed in Supabase schema cache
      if (
        insertResult.error &&
        (insertResult.error.message?.includes('file_path') ||
          insertResult.error.code === 'PGRST204')
      ) {
        console.warn(
          'Notice: documents_vault file_path column not in schema cache, inserting with metadata fallback.'
        );
        const fallbackMetadata = {
          ...metadata,
          file_path: filePath,
        };
        insertResult = await req.db!
          .from('documents_vault')
          .insert({
            user_id: req.userId!,
            workspace_id: workspaceId,
            title: title.trim(),
            doc_type: normalizedDocType,
            file_url: secureUrl,
            expiry_date: expiryDate ? String(expiryDate).slice(0, 10) : null,
            linked_transaction_id: linkedTransactionId || null,
            metadata: fallbackMetadata,
          })
          .select('*')
          .single();
      }

      const doc = insertResult.data;
      const insertErr = insertResult.error;

      if (insertErr || !doc) {
        res.status(500).json({
          error: insertErr?.message || 'Failed to create document record',
        });
        return;
      }

      // If linked to transaction, update transaction receipt path as well
      if (linkedTransactionId && (filePath || secureUrl)) {
        await req.db!
          .from('transactions')
          .update({
            receipt_image_path: filePath,
            receipt_image_url: secureUrl,
          })
          .eq('id', linkedTransactionId);
      }

      res.status(201).json({
        document: {
          id: doc.id,
          userId: doc.user_id,
          workspaceId: doc.workspace_id,
          title: doc.title,
          docType: doc.doc_type,
          fileUrl: secureUrl,
          filePath: doc.file_path,
          expiryDate: doc.expiry_date,
          linkedTransactionId: doc.linked_transaction_id,
          metadata: doc.metadata,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
        },
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to save document';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/v1/vault/:id/signed-url
 * Generates a fresh secure signed URL for viewing or downloading a vault document.
 */
router.get(
  '/vault/:id/signed-url',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { data: doc, error } = await req.db!
        .from('documents_vault')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.userId!)
        .single();

      if (error || !doc) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      let signedUrl = doc.file_url;
      if (doc.file_path) {
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from('documents-vault')
          .createSignedUrl(doc.file_path, 7200); // 2 hours
        if (!signErr && signed?.signedUrl) {
          signedUrl = signed.signedUrl;
        }
      }

      res.json({ signedUrl, document: doc });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate signed URL';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * DELETE /api/v1/vault/:id
 * Removes a document from the vault and deletes its stored file.
 */
router.delete(
  '/vault/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { data: doc } = await req.db!
        .from('documents_vault')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.userId!)
        .single();

      const pathToDelete = doc?.file_path || doc?.metadata?.file_path;
      if (pathToDelete) {
        await supabaseAdmin.storage
          .from('documents-vault')
          .remove([pathToDelete]);
      }

      const { error: delErr } = await req.db!
        .from('documents_vault')
        .delete()
        .eq('id', id)
        .eq('user_id', req.userId!);

      if (delErr) {
        res.status(500).json({ error: delErr.message });
        return;
      }

      res.json({ success: true, deletedId: id });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete document';
      res.status(500).json({ error: message });
    }
  }
);

export default router;

