import { NavBar } from '../../components/kit/NavBar';
import { PageHeader } from '../../components/kit/PageHeader';

/**
 * Second-level header shared by every 我的 sub-page (08-02, N08-01, N08-10, N08-16): the sticky
 * nav bar, then the same 34/42 title block the tab roots use. Render it straight inside the
 * page's root element so the bar can stick.
 */
export function SubPageHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <>
      <NavBar title={title} onBack={onBack} />
      <PageHeader className="px-6 pt-3.5" subtitle={subtitle} title={title} />
    </>
  );
}
