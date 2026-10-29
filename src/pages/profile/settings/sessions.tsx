import UserSettings from '@app/components/UserProfile/UserSettings';
import UserSessions from '@app/components/UserProfile/UserSettings/UserSessions';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const UserSessionsPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return (
    <UserSettings>
      <UserSessions />
    </UserSettings>
  );
};

export default UserSessionsPage;
