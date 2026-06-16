-- Retention support for transient rendered documents.
--
-- Tailored PDFs are hot-cache artifacts in Supabase Storage. The worker cleanup job prunes
-- old unreferenced document rows and storage objects; these indexes keep that bounded at
-- production scale.

create index if not exists idx_documents_transient_retention
  on jobposted.documents (created_at, id)
  where type in ('tailored_resume', 'cover_letter');

create index if not exists idx_documents_storage_path
  on jobposted.documents (storage_path)
  where storage_path is not null;

create index if not exists idx_applications_resume_doc_id
  on jobposted.applications (resume_doc_id)
  where resume_doc_id is not null;

create index if not exists idx_applications_cover_letter_doc_id
  on jobposted.applications (cover_letter_doc_id)
  where cover_letter_doc_id is not null;

create index if not exists idx_applications_rendered_pdf_path
  on jobposted.applications (rendered_pdf_path)
  where rendered_pdf_path is not null;
