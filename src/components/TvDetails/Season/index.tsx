import AirDateBadge from '@app/components/AirDateBadge';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import DownloadButton from '@app/components/DownloadButton';
import type { DownloadableSeasonResponse } from '@server/interfaces/api/downloadInterfaces';
import type { SeasonWithEpisodes } from '@server/models/Tv';
import { defineMessages, useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages({
  somethingwentwrong: 'Something went wrong while retrieving season data.',
  noepisodes: 'Episode list unavailable.',
  episodecode: 'S{seasonNumber}E{episodeNumber} - {name}',
});

type SeasonProps = {
  seasonNumber: number;
  tvId: number;
  download?: {
    mediaId: number;
    title: string;
    posterPath?: string;
  };
};

const pad = (value: number) => String(value).padStart(2, '0');

const Season = ({ seasonNumber, tvId, download }: SeasonProps) => {
  const intl = useIntl();
  const { data, error } = useSWR<SeasonWithEpisodes>(
    `/api/v1/tv/${tvId}/season/${seasonNumber}`
  );
  const { data: downloadable } = useSWR<DownloadableSeasonResponse>(
    download
      ? `/api/v1/download/tv/${download.mediaId}/season/${seasonNumber}`
      : null
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <div>{intl.formatMessage(messages.somethingwentwrong)}</div>;
  }

  return (
    <div className="flex flex-col justify-center divide-y divide-gray-700">
      {data.episodes.length === 0 ? (
        <p>{intl.formatMessage(messages.noepisodes)}</p>
      ) : (
        data.episodes
          .slice()
          .reverse()
          .map((episode) => {
            return (
              <div
                className="flex flex-col space-y-4 py-4 xl:flex-row xl:space-y-4 xl:space-x-4"
                key={`season-${seasonNumber}-episode-${episode.episodeNumber}`}
              >
                <div className="flex-1">
                  <div className="flex flex-col space-y-2 xl:flex-row xl:items-center xl:space-y-0 xl:space-x-2">
                    <h3 className="text-lg">
                      {episode.episodeNumber} - {episode.name}
                    </h3>
                    {episode.airDate && (
                      <AirDateBadge airDate={episode.airDate} />
                    )}
                  </div>
                  {episode.overview && <p>{episode.overview}</p>}
                  {download &&
                    downloadable?.episodes.some(
                      (e) => e.episodeNumber === episode.episodeNumber
                    ) && (
                      <div className="mt-2">
                        <DownloadButton
                          buttonSize="sm"
                          item={{
                            type: 'episode',
                            mediaId: download.mediaId,
                            seasonNumber,
                            episodeNumber: episode.episodeNumber,
                            title: download.title,
                            subtitle: intl.formatMessage(messages.episodecode, {
                              seasonNumber: pad(seasonNumber),
                              episodeNumber: pad(episode.episodeNumber),
                              name: episode.name,
                            }),
                            posterPath: download.posterPath,
                          }}
                        />
                      </div>
                    )}
                </div>
                {episode.stillPath && (
                  <img
                    className="h-auto w-full rounded-lg xl:h-32 xl:w-auto"
                    src={`https://image.tmdb.org/t/p/original/${episode.stillPath}`}
                    alt=""
                  />
                )}
              </div>
            );
          })
      )}
    </div>
  );
};

export default Season;
