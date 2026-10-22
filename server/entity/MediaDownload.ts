import type { MediaType } from '@server/constants/media';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './User';

// Download links stay valid for this long after the cart was validated
export const DOWNLOAD_LINK_TTL = 1000 * 60 * 60 * 48;

@Entity()
export class MediaDownload {
  @PrimaryGeneratedColumn()
  public id: number;

  @Index()
  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  public user: User;

  @Column({ type: 'varchar' })
  public mediaType: MediaType;

  @Column()
  public tmdbId: number;

  // Plex rating key of the downloaded movie or episode
  @Column()
  public ratingKey: string;

  @Column({ nullable: true })
  public seasonNumber?: number;

  @Column({ nullable: true })
  public episodeNumber?: number;

  @Column()
  public title: string;

  // Plex part key, e.g. /library/parts/1234/1600000000/file.mkv
  @Column({ select: false })
  public partKey: string;

  @Column()
  public fileName: string;

  @Column({ type: 'integer', nullable: true })
  public fileSize?: number | null;

  @CreateDateColumn()
  public createdAt: Date;

  constructor(init?: Partial<MediaDownload>) {
    Object.assign(this, init);
  }

  public isExpired(): boolean {
    return Date.now() - new Date(this.createdAt).getTime() > DOWNLOAD_LINK_TTL;
  }
}

export default MediaDownload;
