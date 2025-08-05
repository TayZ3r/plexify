import { IssueType, IssueTypeName } from '@server/constants/issue';
import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import MediaRequest from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { UserPushSubscription } from '@server/entity/UserPushSubscription';
import type { NotificationAgentConfig } from '@server/lib/settings';
import { getSettings, NotificationAgentKey } from '@server/lib/settings';
import logger from '@server/logger';
import webpush from 'web-push';
import { Notification, shouldSendAdminNotification } from '..';
import type { NotificationAgent, NotificationPayload } from './agent';
import { BaseAgent } from './agent';

interface PushNotificationPayload {
  notificationType: string;
  subject: string;
  message?: string;
  image?: string;
  actionUrl?: string;
  actionUrlTitle?: string;
  requestId?: number;
  pendingRequestsCount?: number;
  isAdmin?: boolean;
}

class WebPushAgent
  extends BaseAgent<NotificationAgentConfig>
  implements NotificationAgent
{
  protected getSettings(): NotificationAgentConfig {
    if (this.settings) {
      return this.settings;
    }

    const settings = getSettings();

    return settings.notifications.agents.webpush;
  }

  private getNotificationPayload(
    type: Notification,
    payload: NotificationPayload
  ): PushNotificationPayload {
    const mediaType = payload.media
      ? payload.media.mediaType === MediaType.MOVIE
        ? 'movie'
        : 'series'
      : undefined;
    const is4k = payload.request?.is4k;

    const issueType = payload.issue
      ? payload.issue.issueType !== IssueType.OTHER
        ? `${IssueTypeName[payload.issue.issueType].toLowerCase()} issue`
        : 'issue'
      : undefined;

    let message: string | undefined;
    switch (type) {
      case Notification.TEST_NOTIFICATION:
        message = payload.message;
        break;
      case Notification.MEDIA_AUTO_REQUESTED:
        message = `Demande automatique envoyée.`;
        break;
      case Notification.MEDIA_APPROVED:
        message = `Votre requête a été approuvée.`;
        break;
      case Notification.MEDIA_AUTO_APPROVED:
        message = `Requête automatiquement approuvée. Demandé par ${
          payload.request?.requestedBy.displayName
        }.`;
        break;
      case Notification.MEDIA_AVAILABLE:
        message = `Votre requête est disponible !`;
        break;
      case Notification.MEDIA_DECLINED:
        message = `Votre requête a été rejetée.`;
        break;
      case Notification.MEDIA_FAILED:
        message = `Impossible de télécharger votre requête.`;
        break;
      case Notification.MEDIA_PENDING:
        message = `Validation requise pour un/une ${mediaType} de ${
          payload.request?.requestedBy.displayName
        }.`;
        break;
      case Notification.ISSUE_CREATED:
        message = `Une nouvelle ${issueType} a été ouverte par ${payload.issue?.createdBy.displayName}.`;
        break;
      case Notification.ISSUE_COMMENT:
        message = `${payload.comment?.user.displayName} a commenté ${issueType}.`;
        break;
      case Notification.ISSUE_RESOLVED:
        message = `${issueType} a été marquée comme résolue par ${payload.issue?.modifiedBy?.displayName}!`;
        break;
      case Notification.ISSUE_REOPENED:
        message = `${issueType} a été réouverte par ${payload.issue?.modifiedBy?.displayName}.`;
        break;
      default:
        return {
          notificationType: Notification[type],
          subject: 'Unknown',
        };
    }

    const actionUrl = payload.issue
      ? `/issues/${payload.issue.id}`
      : payload.media
      ? `/${payload.media.mediaType}/${payload.media.tmdbId}`
      : undefined;

    const actionUrlTitle = actionUrl
      ? `View ${payload.issue ? 'Issue' : 'Media'}`
      : undefined;

    return {
      notificationType: Notification[type],
      subject: payload.subject,
      message,
      image: payload.image,
      requestId: payload.request?.id,
      actionUrl,
      actionUrlTitle,
      pendingRequestsCount: payload.pendingRequestsCount,
      isAdmin: payload.isAdmin,
    };
  }

  public shouldSend(): boolean {
    if (this.getSettings().enabled) {
      return true;
    }

    return false;
  }

  public async send(
    type: Notification,
    payload: NotificationPayload
  ): Promise<boolean> {
    const userRepository = getRepository(User);
    const userPushSubRepository = getRepository(UserPushSubscription);
    const settings = getSettings();

    const pushSubs: UserPushSubscription[] = [];

    const mainUser = await userRepository.findOne({ where: { id: 1 } });

    const requestRepository = getRepository(MediaRequest);

    const pendingRequests = await requestRepository.find({
      where: { status: MediaRequestStatus.PENDING },
    });

    const webPushNotification = async (
      pushSub: UserPushSubscription,
      notificationPayload: Buffer
    ) => {
      logger.debug('Sending web push notification', {
        label: 'Notifications',
        recipient: pushSub.user.displayName,
        type: Notification[type],
        subject: payload.subject,
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: pushSub.endpoint,
            keys: {
              auth: pushSub.auth,
              p256dh: pushSub.p256dh,
            },
          },
          notificationPayload
        );
      } catch (e) {
        logger.error(
          'Error sending web push notification; removing subscription',
          {
            label: 'Notifications',
            recipient: pushSub.user.displayName,
            type: Notification[type],
            subject: payload.subject,
            errorMessage: e.message,
          }
        );

        // Failed to send notification so we need to remove the subscription
        userPushSubRepository.remove(pushSub);
      }
    };

    if (
      payload.notifyUser &&
      // Check if user has webpush notifications enabled and fallback to true if undefined
      // since web push should default to true
      (payload.notifyUser.settings?.hasNotificationType(
        NotificationAgentKey.WEBPUSH,
        type
      ) ??
        true)
    ) {
      const notifySubs = await userPushSubRepository.find({
        where: { user: { id: payload.notifyUser.id } },
      });

      pushSubs.push(...notifySubs);
    }

    if (
      payload.notifyAdmin ||
      type === Notification.MEDIA_APPROVED ||
      type === Notification.MEDIA_DECLINED
    ) {
      const users = await userRepository.find();

      const manageUsers = users.filter(
        (user) =>
          // Check if user has webpush notifications enabled and fallback to true if undefined
          // since web push should default to true
          (user.settings?.hasNotificationType(
            NotificationAgentKey.WEBPUSH,
            type
          ) ??
            true) &&
          shouldSendAdminNotification(type, user, payload)
      );

      const allSubs = await userPushSubRepository
        .createQueryBuilder('pushSub')
        .leftJoinAndSelect('pushSub.user', 'user')
        .where('pushSub.userId IN (:...users)', {
          users: manageUsers.map((user) => user.id),
        })
        .getMany();

      // We only want to send the custom notification when type is approved or declined
      // Otherwise, default to the normal notification
      if (
        type === Notification.MEDIA_APPROVED ||
        type === Notification.MEDIA_DECLINED
      ) {
        if (mainUser && allSubs.length > 0) {
          webpush.setVapidDetails(
            `mailto:${mainUser.email}`,
            settings.vapidPublic,
            settings.vapidPrivate
          );

          // Custom payload only for updating the app badge
          const notificationBadgePayload = Buffer.from(
            JSON.stringify(
              this.getNotificationPayload(type, {
                subject: payload.subject,
                notifySystem: false,
                notifyAdmin: true,
                isAdmin: true,
                pendingRequestsCount: pendingRequests.length,
              })
            ),
            'utf-8'
          );

          await Promise.all(
            allSubs.map(async (sub) => {
              webPushNotification(sub, notificationBadgePayload);
            })
          );
        }
      } else {
        pushSubs.push(...allSubs);
      }
    }

    if (mainUser && pushSubs.length > 0) {
      webpush.setVapidDetails(
        `mailto:${mainUser.email}`,
        settings.vapidPublic,
        settings.vapidPrivate
      );

      if (type === Notification.MEDIA_PENDING) {
        payload = { ...payload, pendingRequestsCount: pendingRequests.length };
      }

      const notificationPayload = Buffer.from(
        JSON.stringify(this.getNotificationPayload(type, payload)),
        'utf-8'
      );

      await Promise.all(
        pushSubs.map(async (sub) => {
          webPushNotification(sub, notificationPayload);
        })
      );
    }

    return true;
  }
}

export default WebPushAgent;
