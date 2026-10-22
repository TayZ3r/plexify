import Button from '@app/components/Common/Button';
import type { NewCartItem } from '@app/context/DownloadCartContext';
import { getCartItemKey } from '@app/context/DownloadCartContext';
import useDownloadCart from '@app/hooks/useDownloadCart';
import { ArrowDownTrayIcon, CheckIcon } from '@heroicons/react/24/outline';
import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  download: 'Download',
  incart: 'In Cart',
  includedinseason: 'Included in Season',
});

interface DownloadButtonProps {
  item: NewCartItem;
  buttonSize?: 'default' | 'lg' | 'md' | 'sm';
  className?: string;
}

const DownloadButton = ({
  item,
  buttonSize = 'md',
  className,
}: DownloadButtonProps) => {
  const intl = useIntl();
  const { items, addItem, removeItem, hasItem } = useDownloadCart();
  const key = getCartItemKey(item);
  const inCart = !!items.find((i) => i.key === key);
  const coveredBySeason = !inCart && hasItem(item);

  return (
    <Button
      buttonType={inCart || coveredBySeason ? 'success' : 'primary'}
      buttonSize={buttonSize}
      className={className}
      disabled={coveredBySeason}
      onClick={(e) => {
        e.stopPropagation();

        if (inCart) {
          removeItem(key);
        } else {
          addItem(item);
        }
      }}
    >
      {inCart || coveredBySeason ? <CheckIcon /> : <ArrowDownTrayIcon />}
      <span>
        {intl.formatMessage(
          coveredBySeason
            ? messages.includedinseason
            : inCart
            ? messages.incart
            : messages.download
        )}
      </span>
    </Button>
  );
};

export default DownloadButton;
