import { BarChart3, Database, Info, MessageSquare, Moon, CloudOff, ScrollText, Smartphone, Sun } from 'lucide-react';
import { useHashRoute } from '../hooks/useHashRoute';
import { isStandaloneDisplay } from './profile/installState';
import { useAppStore } from '../state/AppContext';
import { PageHeader } from '../components/kit/PageHeader';
import { SectionLabel } from '../components/kit/SectionLabel';
import { Switch } from '../components/kit/Switch';
import { ProfileRow } from './profile/ProfileRow';

const tileIconSize = 17;

/** 我的 (08-01 / NL-06) — a pure index; every entry below it is its own route. */
export function ProfilePage() {
  const { preferences, replacePreferences, updateTheme } = useAppStore();
  const { navigate } = useHashRoute();
  const installed = isStandaloneDisplay();

  return (
    <div className="pt-11">
      <PageHeader className="px-6" subtitle="本地数据、显示偏好与离线缓存" title="我的" />

      <section className="px-6 pt-6">
        <SectionLabel>显示</SectionLabel>
        <div className="mt-1.5">
          <ProfileRow
            icon={
              preferences.theme === 'dark' ? (
                <Moon aria-hidden size={tileIconSize} />
              ) : (
                <Sun aria-hidden size={tileIconSize} />
              )
            }
            subtitle={preferences.theme === 'dark' ? '深色工具界面' : '浅色工具界面'}
            tile="lk-tile--select"
            title="主题"
            trailing={
              <Switch
                checked={preferences.theme === 'dark'}
                label="切换深色和浅色主题"
                onChange={(next) => void updateTheme(next ? 'dark' : 'light')}
              />
            }
          />
          <ProfileRow
            divider={false}
            height={68}
            icon={<BarChart3 size={tileIconSize} />}
            subtitle="只记录页面、是否 PWA、主题与地区。不含 IP、设备标识或队伍内容。"
            tile="lk-tile--neutral"
            title="匿名使用统计"
            trailing={
              <Switch
                checked={!preferences.analyticsOptOut}
                label="切换匿名使用统计"
                onChange={(next) => void replacePreferences({ ...preferences, analyticsOptOut: !next })}
              />
            }
          />
        </div>
      </section>

      <section className="px-6 pt-6">
        <SectionLabel>本地数据</SectionLabel>
        <div className="mt-1.5">
          <ProfileRow
            icon={<Database size={tileIconSize} />}
            subtitle="导出或导入 JSON · 含队伍与偏好"
            tile="lk-tile--blue"
            title="本地备份"
            onClick={() => navigate({ name: 'profile-backup' })}
          />
          <ProfileRow
            divider={false}
            icon={<CloudOff size={tileIconSize} />}
            subtitle="规则内图鉴与环境快照都在本机"
            tile="lk-tile--teal"
            title="离线缓存"
            onClick={() => navigate({ name: 'profile-cache' })}
          />
        </div>
      </section>

      <section className="px-6 pt-6">
        <SectionLabel>其他</SectionLabel>
        <div className="mt-1.5">
          {!installed && (
            <ProfileRow
              icon={<Smartphone size={tileIconSize} />}
              tile="lk-tile--pink"
              title="添加到主屏幕"
              onClick={() => navigate({ name: 'profile-install' })}
            />
          )}
          <ProfileRow
            icon={<MessageSquare size={tileIconSize} />}
            subtitle="不需要账号，构建标识会自动附上"
            tile="lk-tile--amber"
            title="留言"
            onClick={() => navigate({ name: 'profile-feedback' })}
          />
          <ProfileRow
            icon={<ScrollText size={tileIconSize} />}
            subtitle="规则周期、计时与可用池子"
            tile="lk-tile--blue"
            title="当前规则"
            onClick={() => navigate({ name: 'profile-rule' })}
          />
          <ProfileRow
            divider={false}
            icon={<Info size={tileIconSize} />}
            subtitle="版本信息、数据来源、清除本地数据"
            tile="lk-tile--neutral"
            title="关于与数据"
            onClick={() => navigate({ name: 'profile-about' })}
          />
        </div>
        <p className="mt-[18px] text-xs font-semibold leading-[18px] text-textSecondary">
          LuxrayKit 是非官方粉丝工具，与任天堂／宝可梦公司无关。
        </p>
      </section>
    </div>
  );
}
