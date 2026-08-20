import UploadForm from '@/components/UploadForm';

export const metadata = {
  title: 'New conversion — EPUB → PDF Converter',
};

export default function UploadPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">New conversion</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Upload an EPUB or point to one by URL, tune the render options, and submit.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <UploadForm />
      </div>
    </div>
  );
}
