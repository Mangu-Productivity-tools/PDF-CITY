import { z } from 'zod';
import { RenderEngine, PageSize } from './constants.js';

/**
 * POST /api/v1/convert (application/json body, when using file_url)
 */
export const ConvertOptionsSchema = z.object({
  engine: z.nativeEnum(RenderEngine).default(RenderEngine.CHROME),
  page_size: z.nativeEnum(PageSize).default(PageSize.A4),
  margin_top_in: z.number().min(0).max(3).default(0.75),
  margin_bottom_in: z.number().min(0).max(3).default(0.75),
  margin_left_in: z.number().min(0).max(3).default(0.75),
  margin_right_in: z.number().min(0).max(3).default(0.75),
  include_header: z.boolean().default(false),
  include_footer: z.boolean().default(true),
  header_template: z.string().max(2000).optional(),
  footer_template: z.string().max(2000).optional(),
}).default({});

export const ConvertByUrlSchema = z.object({
  file_url: z.string().url().refine((u) => u.startsWith('https://'), {
    message: 'file_url must be an HTTPS URL',
  }),
  callback_url: z.string().url().optional(),
  options: ConvertOptionsSchema.optional(),
});

// For multipart/form-data uploads, callback_url/options arrive as form fields
// (JSON-encoded string for options); this schema validates them after parsing.
export const ConvertByUploadFieldsSchema = z.object({
  callback_url: z.string().url().optional(),
  options: ConvertOptionsSchema.optional(),
});

export const JobIdParamSchema = z.object({
  job_id: z.string().uuid(),
});

export const ListJobsQuerySchema = z.object({
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const UpdateJobSchema = z.object({
  options: ConvertOptionsSchema,
});
