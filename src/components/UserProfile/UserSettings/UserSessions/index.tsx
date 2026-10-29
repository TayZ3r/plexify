import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import Error from '@app/pages/_error';
import {
  ArrowRightOnRectangleIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/solid';
import type {
  UserSession,
  UserSessionsResponse,
} from '@server/interfaces/api/userSettingsInterfaces';
import axios from 'axios';
import { useRouter } from 'next/router';
import { defineMessages, useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';
import { UAParser } from 'ua-parser-js';

const messages = defineMessages({
  sessions: 'Sessions',
  sessionsDescription:
    'Every device currently signed in to this account. Deleting a session signs the device out.',
  noSessions: 'This user has no open session.',
  currentSession: 'This Session',
  unknownDevice: 'Unknown Device',
  unknown: 'Unknown',
  ipAddress: 'IP Address',
  signedIn: 'Signed In',
  lastActive: 'Last Active',
  expires: 'Expires',
  deleteSession: 'Sign Out',
  deleteAllSessions: 'Sign Out All Sessions',
  toastDeleteSuccess: 'Session deleted.',
  toastDeleteAllSuccess:
    '{count} {count, plural, one {session} other {sessions}} deleted.',
  toastDeleteFailure: 'Something went wrong while deleting the session.',
});

const formatDateTime = (
  date: Date | string | undefined,
  intl: ReturnType<typeof useIntl>
) =>
  date
    ? intl.formatDate(date, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : intl.formatMessage(messages.unknown);

const getDeviceName = (session: UserSession): string | undefined => {
  if (!session.userAgent) {
    return undefined;
  }

  const parsed = UAParser(session.userAgent);
  const browser = parsed.browser.name;
  const os = [parsed.os.name, parsed.os.version].filter(Boolean).join(' ');

  return [browser, os].filter(Boolean).join(' · ') || undefined;
};

const UserSessions = () => {
  const intl = useIntl();
  const router = useRouter();
  const { addToast } = useToasts();
  const { user } = useUser({ id: Number(router.query.userId) });
  const { data, error, mutate } = useSWR<UserSessionsResponse>(
    user ? `/api/v1/user/${user.id}/settings/sessions` : null
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <Error statusCode={500} />;
  }

  // Deleting our own current session signs us out: go back to the login page
  const signOutIfNeeded = (deletedCurrent: boolean) => {
    if (deletedCurrent) {
      window.location.href = '/login';
    }
  };

  const deleteSession = async (session: UserSession) => {
    try {
      await axios.delete(
        `/api/v1/user/${user?.id}/settings/sessions/${session.id}`
      );
      addToast(intl.formatMessage(messages.toastDeleteSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
      signOutIfNeeded(session.current);
    } catch (e) {
      addToast(intl.formatMessage(messages.toastDeleteFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      mutate();
    }
  };

  const deleteAllSessions = async () => {
    try {
      const response = await axios.delete<{ deleted: number }>(
        `/api/v1/user/${user?.id}/settings/sessions`
      );
      addToast(
        intl.formatMessage(messages.toastDeleteAllSuccess, {
          count: response.data.deleted,
        }),
        { autoDismiss: true, appearance: 'success' }
      );
      signOutIfNeeded(data.sessions.some((session) => session.current));
    } catch (e) {
      addToast(intl.formatMessage(messages.toastDeleteFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      mutate();
    }
  };

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.sessions),
          intl.formatMessage(globalMessages.usersettings),
          user?.displayName,
        ]}
      />
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h3 className="heading">{intl.formatMessage(messages.sessions)}</h3>
          <p className="description">
            {intl.formatMessage(messages.sessionsDescription)}
          </p>
        </div>
        {data.sessions.length > 0 && (
          <ConfirmButton
            onClick={() => deleteAllSessions()}
            confirmText={intl.formatMessage(globalMessages.areyousure)}
            className="flex-shrink-0"
          >
            <ArrowRightOnRectangleIcon />
            <span>{intl.formatMessage(messages.deleteAllSessions)}</span>
          </ConfirmButton>
        )}
      </div>
      {data.sessions.length === 0 ? (
        <Alert title={intl.formatMessage(messages.noSessions)} type="info" />
      ) : (
        <div className="space-y-4">
          {data.sessions.map((session) => {
            const isMobile =
              session.userAgent &&
              UAParser(session.userAgent).device.type === 'mobile';

            return (
              <div
                key={session.id}
                className="flex w-full flex-col justify-between gap-4 rounded-xl bg-gray-800 p-4 text-gray-400 shadow-md ring-1 ring-gray-700 xl:flex-row xl:items-center"
              >
                <div className="flex min-w-0 items-center xl:w-1/3">
                  <div className="h-auto w-10 flex-shrink-0">
                    {isMobile ? (
                      <DevicePhoneMobileIcon />
                    ) : (
                      <ComputerDesktopIcon />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col pl-3">
                    <span className="truncate text-lg font-bold text-white">
                      {getDeviceName(session) ??
                        intl.formatMessage(messages.unknownDevice)}
                    </span>
                    {session.current && (
                      <div>
                        <Badge badgeType="success">
                          {intl.formatMessage(messages.currentSession)}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 text-sm">
                  <div className="card-field">
                    <span className="card-field-name">
                      {intl.formatMessage(messages.ipAddress)}
                    </span>
                    <span className="truncate text-gray-300">
                      {session.ip ?? intl.formatMessage(messages.unknown)}
                    </span>
                  </div>
                  <div className="card-field">
                    <span className="card-field-name">
                      {intl.formatMessage(messages.signedIn)}
                    </span>
                    <span className="truncate text-gray-300">
                      {formatDateTime(session.createdAt, intl)}
                    </span>
                  </div>
                  <div className="card-field">
                    <span className="card-field-name">
                      {intl.formatMessage(messages.lastActive)}
                    </span>
                    <span className="truncate text-gray-300">
                      {formatDateTime(session.lastActiveAt, intl)}
                    </span>
                  </div>
                  <div className="card-field">
                    <span className="card-field-name">
                      {intl.formatMessage(messages.expires)}
                    </span>
                    <span className="truncate text-gray-300">
                      {formatDateTime(session.expiresAt, intl)}
                    </span>
                  </div>
                </div>
                <div className="xl:w-64">
                  <ConfirmButton
                    onClick={() => deleteSession(session)}
                    confirmText={intl.formatMessage(globalMessages.areyousure)}
                    className="w-full"
                  >
                    <ArrowRightOnRectangleIcon />
                    <span>{intl.formatMessage(messages.deleteSession)}</span>
                  </ConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default UserSessions;
