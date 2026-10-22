import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import SlideOver from '@app/components/Common/SlideOver';
import useDownloadCart from '@app/hooks/useDownloadCart';
import { Permission, useUser } from '@app/hooks/useUser';
import { formatBytes } from '@app/utils/numberHelpers';
import {
  ArrowDownTrayIcon,
  ShoppingCartIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type {
  DownloadCheckoutResponse,
  DownloadFile,
  DownloadListResponse,
} from '@server/interfaces/api/downloadInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages({
  cart: 'Download Cart',
  opencart: 'Open download cart',
  emptycart: 'Your download cart is empty.',
  quotaremaining:
    '{remaining} of {limit} {limit, plural, one {download} other {downloads}} remaining (per {days} {days, plural, one {day} other {days}})',
  quotaunlimited: 'Unlimited downloads',
  seasonnote: 'A season counts as one download per episode.',
  validate: 'Validate & Download',
  validating: 'Preparing…',
  clear: 'Clear Cart',
  remove: 'Remove',
  recentdownloads: 'Recent Downloads',
  recentdownloadstip:
    'Links stay valid for 48 hours. If your browser blocked some downloads, start them from here.',
  downloadstarted:
    '{count, plural, one {# download} other {# downloads}} started!',
  checkoutfailed: 'Something went wrong while validating the cart.',
  quotaexceeded:
    'Download limit exceeded: you have {remaining, plural, =0 {no download} one {# download} other {# downloads}} left.',
  nofiles: 'No downloadable file was found for the selected items.',
  expires: 'Expires {date}',
});

// Delay between each download so that browsers do not drop any of them
const DOWNLOAD_INTERVAL = 1500;

const startDownload = (file: DownloadFile) => {
  const link = document.createElement('a');
  link.href = file.url;
  link.download = file.fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const DownloadCart = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const { items, isOpen, setOpen, removeItem, clear } = useDownloadCart();
  const [isSubmitting, setSubmitting] = useState(false);
  const canDownload = hasPermission(Permission.DOWNLOAD);
  const { data, mutate } = useSWR<DownloadListResponse>(
    canDownload ? '/api/v1/download' : null
  );

  if (!canDownload) {
    return null;
  }

  const quota = data?.quota;

  const validate = async () => {
    setSubmitting(true);

    try {
      const response = await axios.post<DownloadCheckoutResponse>(
        '/api/v1/download',
        {
          items: items.map((item) =>
            item.type === 'movie'
              ? { type: item.type, mediaId: item.mediaId }
              : item.type === 'season'
              ? {
                  type: item.type,
                  mediaId: item.mediaId,
                  seasonNumber: item.seasonNumber,
                }
              : {
                  type: item.type,
                  mediaId: item.mediaId,
                  seasonNumber: item.seasonNumber,
                  episodeNumber: item.episodeNumber,
                }
          ),
        }
      );

      clear();
      mutate();

      response.data.downloads.forEach((file, index) => {
        setTimeout(() => startDownload(file), index * DOWNLOAD_INTERVAL);
      });

      addToast(
        intl.formatMessage(messages.downloadstarted, {
          count: response.data.downloads.length,
        }),
        { appearance: 'success', autoDismiss: true }
      );
    } catch (e) {
      addToast(
        e.response?.status === 403
          ? intl.formatMessage(messages.quotaexceeded, {
              remaining: quota?.remaining ?? 0,
            })
          : e.response?.status === 404
          ? intl.formatMessage(messages.nofiles)
          : intl.formatMessage(messages.checkoutfailed),
        { appearance: 'error', autoDismiss: true }
      );
      mutate();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {(items.length > 0 || !!data?.downloads.length) && (
        <button
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-indigo-500 bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-500 focus:outline-none sm:bottom-6 sm:right-6"
          aria-label={intl.formatMessage(messages.opencart)}
          onClick={() => setOpen(true)}
        >
          <ShoppingCartIcon className="h-7 w-7" />
          {items.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold">
              {items.length}
            </span>
          )}
        </button>
      )}
      <SlideOver
        show={isOpen}
        title={intl.formatMessage(messages.cart)}
        subText={
          quota
            ? quota.limit
              ? intl.formatMessage(messages.quotaremaining, {
                  remaining: quota.remaining ?? 0,
                  limit: quota.limit,
                  days: quota.days ?? 0,
                })
              : intl.formatMessage(messages.quotaunlimited)
            : undefined
        }
        onClose={() => setOpen(false)}
      >
        <div className="space-y-6">
          {items.length === 0 ? (
            <p className="text-gray-400">
              {intl.formatMessage(messages.emptycart)}
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center space-x-3 rounded-md border border-gray-700 bg-gray-800 p-2"
                  >
                    <div className="relative h-16 w-11 flex-shrink-0 overflow-hidden rounded">
                      <CachedImage
                        src={
                          item.posterPath
                            ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${item.posterPath}`
                            : '/images/overseerr_poster_not_found.png'
                        }
                        alt=""
                        layout="fill"
                        objectFit="cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-white">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="truncate text-sm text-gray-400">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    <button
                      className="text-gray-400 transition hover:text-red-500 focus:outline-none"
                      aria-label={intl.formatMessage(messages.remove)}
                      onClick={() => removeItem(item.key)}
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </li>
                ))}
              </ul>
              {items.some((item) => item.type === 'season') && (
                <p className="text-sm text-gray-400">
                  {intl.formatMessage(messages.seasonnote)}
                </p>
              )}
              <div className="flex justify-end space-x-2">
                <Button
                  buttonType="ghost"
                  onClick={() => clear()}
                  disabled={isSubmitting}
                >
                  <TrashIcon />
                  <span>{intl.formatMessage(messages.clear)}</span>
                </Button>
                <Button
                  buttonType="primary"
                  onClick={() => validate()}
                  disabled={isSubmitting || !!quota?.restricted}
                >
                  <ArrowDownTrayIcon />
                  <span>
                    {intl.formatMessage(
                      isSubmitting ? messages.validating : messages.validate
                    )}
                  </span>
                </Button>
              </div>
            </>
          )}
          {!!data?.downloads.length && (
            <div>
              <h3 className="text-lg font-bold text-white">
                {intl.formatMessage(messages.recentdownloads)}
              </h3>
              <p className="mb-2 text-sm text-gray-400">
                {intl.formatMessage(messages.recentdownloadstip)}
              </p>
              <ul className="divide-y divide-gray-700">
                {data.downloads.map((file) => (
                  <li
                    key={`download-${file.id}`}
                    className="flex items-center justify-between space-x-2 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-white">{file.title}</div>
                      <div className="truncate text-xs text-gray-400">
                        {file.fileName}
                        {file.fileSize
                          ? ` · ${formatBytes(file.fileSize)}`
                          : ''}
                        {' · '}
                        {intl.formatMessage(messages.expires, {
                          date: intl.formatDate(file.expiresAt, {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }),
                        })}
                      </div>
                    </div>
                    <Button
                      as="a"
                      href={file.url}
                      download={file.fileName}
                      buttonSize="sm"
                    >
                      <ArrowDownTrayIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SlideOver>
    </>
  );
};

export default DownloadCart;
