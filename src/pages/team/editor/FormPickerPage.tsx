import { Check, Info } from 'lucide-react';
import { items } from '../../../data';
import type { BattleFormView } from '../../../lib/pokemonForms';
import { ListRow, Sprite, TypeDot } from '../../../components/kit';
import { typeColors, typeLabels } from '../../../components/ui';
import { PickerPage } from './PickerPage';

/** N03-14 — only reachable for a species that actually has a Mega form. */

const megaBadge = (form: BattleFormView, baseName: string) => {
  if (!form.isMega) return '普通';
  const suffix = form.englishName.replace(/^Mega\s+/i, '').replace(baseName, '').trim().toUpperCase();
  return suffix ? `MEGA ${suffix}` : 'MEGA';
};

export function FormPickerPage({
  baseName,
  baseEnglishName,
  forms,
  selectedFormId,
  onPick,
  onBack,
}: {
  baseName: string;
  baseEnglishName: string;
  forms: BattleFormView[];
  selectedFormId: string;
  onPick: (formId: string) => void;
  onBack: () => void;
}) {
  const selected = forms.find((form) => form.id === selectedFormId) ?? forms[0];
  const megaCount = forms.filter((form) => form.isMega).length;

  return (
    <PickerPage
      backLabel="返回编辑配置"
      subtitle={`${baseName}有 ${megaCount} 种超级进化`}
      title="形态"
      onBack={onBack}
    >
      <div className="px-6 pt-[22px]">
        <div
          className="lk-editor-aura overflow-hidden rounded-[20px] p-5 text-center"
          style={
            {
              '--lk-aura-c1': typeColors[selected.types[0]] ?? '#8e8e93',
              '--lk-aura-c2': typeColors[selected.types[1] ?? selected.types[0]] ?? '#8e8e93',
            } as React.CSSProperties
          }
        >
          <Sprite
            className="mx-auto drop-shadow-[0_18px_28px_rgba(0,0,0,0.5)]"
            iconRef={selected.iconRef}
            label={selected.chineseName}
            size={132}
          />
          <p className="mt-1 flex items-center justify-center gap-2">
            <span className="text-[20px] font-extrabold tracking-[-0.01em]">{selected.chineseName}</span>
            <span className="inline-flex h-[22px] items-center rounded-full bg-textPrimary/[0.14] px-[9px] text-[11px] font-extrabold tracking-[0.06em]">
              {megaBadge(selected, baseEnglishName)}
            </span>
          </p>
          <p className="mt-2.5 flex items-center justify-center gap-3 text-[13px] font-bold text-textPrimary/85">
            {selected.types.map((type) => (
              <span key={type} className="inline-flex items-center gap-1.5">
                <TypeDot size={8} type={type} />
                {typeLabels[type]}
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className="px-6 pt-[22px]">
        {forms.map((form, index) => {
          const active = form.id === selected.id;
          const stone = form.requiredItemId ? items.find((item) => item.id === form.requiredItemId) : undefined;
          return (
            <ListRow
              key={form.id}
              active={active}
              ariaLabel={`${form.chineseName} ${megaBadge(form, baseEnglishName)}`}
              bleed
              divider={index < forms.length - 1}
              gap={14}
              height={68}
              leading={<Sprite iconRef={form.iconRef} label={form.chineseName} size={48} />}
              subtitle={[
                form.types.map((type) => typeLabels[type]).join(' · '),
                `速度种族值 ${form.baseStats.speed}`,
                stone ? `需要${stone.chineseName}` : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
              title={form.chineseName}
              trailing={
                <>
                  <span
                    className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-[9px] text-[11px] font-extrabold ${
                      active ? 'bg-textPrimary/[0.14] text-textPrimary' : 'bg-btn1 text-textLabel'
                    }`}
                  >
                    {megaBadge(form, baseEnglishName)}
                  </span>
                  {active && <Check className="shrink-0 text-textPrimary" size={18} />}
                </>
              }
              onClick={() => onPick(form.id)}
            />
          );
        })}
        <div className="lk-notice mt-4 flex gap-2.5 rounded-[14px] p-[14px]">
          <span className="mt-px shrink-0 text-textLabel">
            <Info size={18} />
          </span>
          <p className="min-w-0 flex-1 text-xs font-semibold leading-[18px] text-textLabel">选 MEGA 会把道具换成对应的进化石。</p>
        </div>
      </div>
    </PickerPage>
  );
}
