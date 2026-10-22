import { DownloadCartContext } from '@app/context/DownloadCartContext';
import { useContext } from 'react';

const useDownloadCart = () => useContext(DownloadCartContext);

export default useDownloadCart;
