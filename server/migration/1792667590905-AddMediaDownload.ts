import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaDownload1792667590905 implements MigrationInterface {
  name = 'AddMediaDownload1792667590905';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "media_download" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mediaType" varchar NOT NULL, "tmdbId" integer NOT NULL, "ratingKey" varchar NOT NULL, "seasonNumber" integer, "episodeNumber" integer, "title" varchar NOT NULL, "partKey" varchar NOT NULL, "fileName" varchar NOT NULL, "fileSize" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer, CONSTRAINT "FK_869ed9c29ba013b9e701fe2a082" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_869ed9c29ba013b9e701fe2a08" ON "media_download" ("userId") `
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "downloadQuotaLimit" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "downloadQuotaDays" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "downloadQuotaDays"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "downloadQuotaLimit"`
    );
    await queryRunner.query(`DROP INDEX "IDX_869ed9c29ba013b9e701fe2a08"`);
    await queryRunner.query(`DROP TABLE "media_download"`);
  }
}
