import type { QuotaStatus } from './userInterfaces';

export type DownloadCartItem =
  | { type: 'movie'; mediaId: number }
  | { type: 'season'; mediaId: number; seasonNumber: number }
  | {
      type: 'episode';
      mediaId: number;
      seasonNumber: number;
      episodeNumber: number;
    };

export interface DownloadFile {
  id: number;
  title: string;
  fileName: string;
  fileSize?: number | null;
  createdAt: Date;
  expiresAt: Date;
  url: string;
}

export interface DownloadCheckoutRequest {
  items: DownloadCartItem[];
}

export interface DownloadCheckoutResponse {
  downloads: DownloadFile[];
  quota: QuotaStatus;
}

export interface DownloadListResponse {
  downloads: DownloadFile[];
  quota: QuotaStatus;
}

export interface DownloadableEpisode {
  episodeNumber: number;
  title: string;
  files: number;
}

export interface DownloadableSeasonResponse {
  seasonNumber: number;
  episodes: DownloadableEpisode[];
}
