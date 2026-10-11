import { Alert, AppShell, Container, Group } from '@mantine/core';
import { useMediaQuery, useNetwork } from '@mantine/hooks';
import { IconFilePlus, IconFileText, IconHome, IconList, IconNotes, IconSettings, IconWifiOff } from '@tabler/icons-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { invoiceExistsOrDeleted, upsertDraft } from '../lib/db';
import { pushLocalDrafts } from '../lib/draftSync';

const WIDE = '(min-width: 900px)';
const LINKS = [
  { to: '/', label: 'Home', icon: IconHome },
  { to: '/invoices/new', label: 'New Invoice', icon: IconFilePlus },
  { to: '/invoices', label: 'Invoices', icon: IconFileText },
  { to: '/drafts', label: 'Drafts', icon: IconNotes },
  { to: '/lists', label: 'Lists', icon: IconList },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];
/** Five 18px labels do not fit a 360px phone; Lists and Settings are on the Home tiles. */
const PHONE_LINKS = LINKS.slice(0, 4);

export function AppLayout() {
  // Drafts kept on this device while offline are sent as soon as the app opens again.
  useEffect(() => {
    void pushLocalDrafts(window.localStorage, upsertDraft, invoiceExistsOrDeleted);
  }, []);

  const wide = useMediaQuery(WIDE, window.matchMedia(WIDE).matches, { getInitialValueInEffect: false });
  const { online } = useNetwork();
  const { pathname } = useLocation();

  const nav = (
    <Group
      component="nav"
      aria-label="Main"
      h="100%"
      px="sm"
      gap={wide ? 'md' : 0}
      justify={wide ? 'flex-start' : 'space-around'}
      wrap="nowrap"
      className="cy-nav"
    >
      {(wide ? LINKS : PHONE_LINKS).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className="cy-nav-link"
        >
          <Icon size={28} aria-hidden />
          {label}
        </NavLink>
      ))}
    </Group>
  );

  return (
    <AppShell header={wide ? { height: 72 } : undefined} footer={wide ? undefined : { height: 84 }} padding="md">
      <div className="cy-backdrop" aria-hidden="true" />
      {wide ? (
        <AppShell.Header>
          <span className="cy-brand" aria-hidden="true">
            CHALLAN
          </span>
          {nav}
        </AppShell.Header>
      ) : (
        <AppShell.Footer>{nav}</AppShell.Footer>
      )}
      <AppShell.Main>
        <Container size="lg" px={0}>
          {!online && (
            <Alert color="yellow" icon={<IconWifiOff />} mb="md" title="No internet">
              No internet — your work is safe on this screen
            </Alert>
          )}
          <div key={pathname} className="cy-enter">
            <Outlet />
          </div>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
