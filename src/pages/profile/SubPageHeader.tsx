import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '../../components/kit/PageHeader';

/**
 * Second-level header shared by every 我的 sub-page (08-02, N08-01, N08-10, N08-16): a 36px
 * round back button, then the same 34/42 title block the tab roots use.
 */
export function SubPageHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="px-6 pt-5">
      <button
        aria-label="返回"
        className="grid h-9 w-9 place-items-center rounded-full bg-surface text-textLabel"
        type="button"
        onClick={onBack}
      >
        <ChevronLeft size={20} />
      </button>
      <PageHeader className="pt-3.5" subtitle={subtitle} title={title} />
    </div>
  );
}
