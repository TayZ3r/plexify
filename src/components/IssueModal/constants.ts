import { IssueType } from '@server/constants/issue';
import { MediaStatus } from '@server/constants/media';
import type { MessageDescriptor } from 'react-intl';
import { defineMessages } from 'react-intl';

const messages = defineMessages({
  issueAudio: 'Audio',
  issueVideo: 'Video',
  issueSubtitles: 'Subtitle',
  issueOther: 'Other',
});

interface IssueOption {
  name: MessageDescriptor;
  issueType: IssueType;
  mediaType?: 'movie' | 'tv';
}

export const issueOptions: IssueOption[] = [
  {
    name: messages.issueVideo,
    issueType: IssueType.VIDEO,
  },
  {
    name: messages.issueAudio,
    issueType: IssueType.AUDIO,
  },
  {
    name: messages.issueSubtitles,
    issueType: IssueType.SUBTITLES,
  },
  {
    name: messages.issueOther,
    issueType: IssueType.OTHER,
  },
];

// Issues can be reported on available media, but also on requested media
// that is not available yet (pending approval or being processed)
export const issueReportableStatuses: (MediaStatus | undefined)[] = [
  MediaStatus.PENDING,
  MediaStatus.PROCESSING,
  MediaStatus.PARTIALLY_AVAILABLE,
  MediaStatus.AVAILABLE,
];

export const canReportIssue = (status?: MediaStatus): boolean =>
  issueReportableStatuses.includes(status);
