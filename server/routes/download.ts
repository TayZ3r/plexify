import type { PlexMetadata } from '@server/api/plexapi';
import PlexAPI from '@server/api/plexapi';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaDownload, { DOWNLOAD_LINK_TTL } from '@server/entity/MediaDownload';
import { User } from '@server/entity/User';
import type {
  DownloadableSeasonResponse,
  DownloadCartItem,
  DownloadCheckoutRequest,
  DownloadCheckoutResponse,
  DownloadFile,
  DownloadListResponse,
} from '@server/interfaces/api/downloadInterfaces';
import logger from '@server/logger';
import { AfterDate } from '@server/utils/dateHelpers';
import { Router } from 'express';
import fs from 'fs';

// Maximum number of items accepted in a single cart
const MAX_CART_ITEMS = 100;

interface ResolvedFile {
  mediaType: MediaType;
  tmdbId: number;
  ratingKey: string;
  seasonNumber?: number;
  episodeNumber?: number;
  title: string;
  filePath: string;
  fileName: string;
  fileSize?: number;
}

const getAdminPlexToken = async (): Promise<string | undefined> => {
  const admin = await getRepository(User).findOne({
    select: { id: true, plexToken: true },
    where: { id: 1 },
  });

  return admin?.plexToken;
};

const getAdminPlexClient = async (): Promise<PlexAPI> => {
  const plexToken = await getAdminPlexToken();

  if (!plexToken) {
    throw new Error('Plex admin token not found');
  }

  return new PlexAPI({ plexToken });
};

const getFileName = (file: string): string =>
  file.split(/[\\/]/).pop() || 'download';

const pad = (value: number): string => String(value).padStart(2, '0');

const getEpisodeTitle = (episode: PlexMetadata): string =>
  `${episode.grandparentTitle ?? ''} - S${pad(episode.parentIndex ?? 0)}E${pad(
    episode.index
  )} - ${episode.title}`;

const toFiles = (
  metadata: PlexMetadata,
  base: Omit<ResolvedFile, 'filePath' | 'fileName' | 'fileSize' | 'title'>,
  title: string
): ResolvedFile[] => {
  // Only download the first version of the item, but include every part of it
  const parts = metadata.Media?.[0]?.Part ?? [];

  return parts.map((part, index) => ({
    ...base,
    title: parts.length > 1 ? `${title} (${index + 1}/${parts.length})` : title,
    filePath: part.file,
    fileName: getFileName(part.file),
    fileSize: part.size,
  }));
};

const getPlexRatingKey = (media: Media): string | undefined =>
  media.ratingKey ?? media.ratingKey4k ?? undefined;

const getPlexSeasonEpisodes = async (
  plexApi: PlexAPI,
  showRatingKey: string,
  seasonNumber: number
): Promise<PlexMetadata[]> => {
  const seasons = (await plexApi.getChildrenMetadata(showRatingKey)) ?? [];
  const season = seasons.find((s) => s.index === seasonNumber);

  if (!season) {
    return [];
  }

  return (await plexApi.getChildrenMetadata(season.ratingKey)) ?? [];
};

const resolveItem = async (
  plexApi: PlexAPI,
  item: DownloadCartItem
): Promise<ResolvedFile[]> => {
  const media = await getRepository(Media).findOne({
    where: { id: Number(item.mediaId) },
  });
  const ratingKey = media ? getPlexRatingKey(media) : undefined;

  if (!media || !ratingKey) {
    throw new Error(`Media ${item.mediaId} is not available on Plex`);
  }

  if (item.type === 'movie') {
    if (media.mediaType !== MediaType.MOVIE) {
      throw new Error(`Media ${item.mediaId} is not a movie`);
    }

    const metadata = await plexApi.getMetadata(ratingKey);

    return toFiles(
      metadata,
      {
        mediaType: MediaType.MOVIE,
        tmdbId: media.tmdbId,
        ratingKey: metadata.ratingKey,
      },
      metadata.title
    );
  }

  if (media.mediaType !== MediaType.TV) {
    throw new Error(`Media ${item.mediaId} is not a series`);
  }

  const episodes = (
    await getPlexSeasonEpisodes(plexApi, ratingKey, Number(item.seasonNumber))
  ).filter(
    (episode) =>
      item.type === 'season' || episode.index === Number(item.episodeNumber)
  );

  return episodes.flatMap((episode) =>
    toFiles(
      episode,
      {
        mediaType: MediaType.TV,
        tmdbId: media.tmdbId,
        ratingKey: episode.ratingKey,
        seasonNumber: episode.parentIndex ?? Number(item.seasonNumber),
        episodeNumber: episode.index,
      },
      getEpisodeTitle(episode)
    )
  );
};

const mapDownload = (download: MediaDownload): DownloadFile => ({
  id: download.id,
  title: download.title,
  fileName: download.fileName,
  fileSize: download.fileSize,
  createdAt: download.createdAt,
  expiresAt: new Date(
    new Date(download.createdAt).getTime() + DOWNLOAD_LINK_TTL
  ),
  url: `/api/v1/download/${download.id}/file`,
});

const downloadRoutes = Router();

downloadRoutes.get<never, DownloadListResponse>('/', async (req, res, next) => {
  if (!req.user) {
    return next({ status: 401, message: 'You must be logged in.' });
  }

  try {
    const downloads = await getRepository(MediaDownload).find({
      where: {
        user: { id: req.user.id },
        createdAt: AfterDate(new Date(Date.now() - DOWNLOAD_LINK_TTL)),
      },
      order: { createdAt: 'DESC' },
    });
    const quota = await req.user.getQuota();

    return res.status(200).json({
      downloads: downloads.map(mapDownload),
      quota: quota.download,
    });
  } catch (e) {
    logger.error('Something went wrong retrieving downloads', {
      label: 'Download',
      errorMessage: e.message,
    });
    return next({ status: 500, message: 'Unable to retrieve downloads.' });
  }
});

downloadRoutes.get<
  { mediaId: string; seasonNumber: string },
  DownloadableSeasonResponse
>('/tv/:mediaId/season/:seasonNumber', async (req, res, next) => {
  const seasonNumber = Number(req.params.seasonNumber);

  try {
    const media = await getRepository(Media).findOne({
      where: { id: Number(req.params.mediaId), mediaType: MediaType.TV },
    });
    const ratingKey = media ? getPlexRatingKey(media) : undefined;

    if (!ratingKey) {
      return res.status(200).json({ seasonNumber, episodes: [] });
    }

    const plexApi = await getAdminPlexClient();
    const episodes = await getPlexSeasonEpisodes(
      plexApi,
      ratingKey,
      seasonNumber
    );

    return res.status(200).json({
      seasonNumber,
      episodes: episodes
        .map((episode) => ({
          episodeNumber: episode.index,
          title: episode.title,
          files: episode.Media?.[0]?.Part?.length ?? 0,
        }))
        .filter((episode) => episode.files > 0),
    });
  } catch (e) {
    logger.error('Something went wrong retrieving downloadable episodes', {
      label: 'Download',
      errorMessage: e.message,
      mediaId: req.params.mediaId,
      seasonNumber,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve downloadable episodes.',
    });
  }
});

downloadRoutes.post<never, DownloadCheckoutResponse, DownloadCheckoutRequest>(
  '/',
  async (req, res, next) => {
    if (!req.user) {
      return next({ status: 401, message: 'You must be logged in.' });
    }

    const items = req.body.items ?? [];

    if (items.length === 0 || items.length > MAX_CART_ITEMS) {
      return next({
        status: 400,
        message: `The cart must contain between 1 and ${MAX_CART_ITEMS} items.`,
      });
    }

    try {
      const plexApi = await getAdminPlexClient();
      const resolved: ResolvedFile[] = [];

      for (const item of items) {
        resolved.push(...(await resolveItem(plexApi, item)));
      }

      // The same file can be in the cart twice (e.g. an episode and its season)
      const files = resolved.filter(
        (file, index) =>
          resolved.findIndex((f) => f.filePath === file.filePath) === index
      );

      if (files.length === 0) {
        return next({
          status: 404,
          message: 'No downloadable file was found for the selected items.',
        });
      }

      const quota = (await req.user.getQuota()).download;

      if (quota.limit && (quota.remaining ?? 0) < files.length) {
        return next({
          status: 403,
          message: `Download limit exceeded: ${
            files.length
          } file(s) requested, ${quota.remaining ?? 0} remaining.`,
        });
      }

      const downloadRepository = getRepository(MediaDownload);
      const downloads = await downloadRepository.save(
        files.map(
          (file) =>
            new MediaDownload({
              ...file,
              user: req.user,
            })
        )
      );

      logger.info('Download cart validated', {
        label: 'Download',
        userId: req.user.id,
        files: downloads.length,
      });

      return res.status(201).json({
        downloads: downloads.map(mapDownload),
        quota: (await req.user.getQuota()).download,
      });
    } catch (e) {
      logger.error('Something went wrong validating the download cart', {
        label: 'Download',
        errorMessage: e.message,
      });
      return next({ status: 500, message: e.message });
    }
  }
);

downloadRoutes.get<{ downloadId: string }>(
  '/:downloadId/file',
  async (req, res, next) => {
    if (!req.user) {
      return next({ status: 401, message: 'You must be logged in.' });
    }

    try {
      const download = await getRepository(MediaDownload)
        .createQueryBuilder('download')
        .addSelect('download.filePath')
        .leftJoin('download.user', 'user')
        .where('download.id = :id', { id: Number(req.params.downloadId) })
        .andWhere('user.id = :userId', { userId: req.user.id })
        .getOne();

      if (!download) {
        return next({ status: 404, message: 'Download not found.' });
      }

      if (download.isExpired()) {
        return next({ status: 410, message: 'This download link expired.' });
      }

      // Serve the file straight from its path on disk (Range requests included)
      if (!fs.existsSync(download.filePath)) {
        logger.error('Download file not found on disk', {
          label: 'Download',
          downloadId: download.id,
          filePath: download.filePath,
        });
        return next({ status: 404, message: 'File not found on disk.' });
      }

      res.sendFile(
        download.filePath,
        {
          dotfiles: 'allow',
          headers: {
            'Content-Disposition': `attachment; filename="${download.fileName.replace(
              /[^\x20-\x7e]|"/g,
              '_'
            )}"; filename*=UTF-8''${encodeURIComponent(download.fileName)}`,
          },
        },
        (err) => {
          if (err && !res.headersSent) {
            logger.error('Something went wrong sending a download', {
              label: 'Download',
              errorMessage: err.message,
              downloadId: download.id,
            });
            next({ status: 500, message: 'Unable to download the file.' });
          }
        }
      );
    } catch (e) {
      logger.error('Something went wrong retrieving a download', {
        label: 'Download',
        errorMessage: e.message,
        downloadId: req.params.downloadId,
      });
      return next({ status: 500, message: 'Unable to download the file.' });
    }
  }
);

export default downloadRoutes;
