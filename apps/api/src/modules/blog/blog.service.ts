import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import fetch, { Response } from 'node-fetch';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { CreateBlogPostDto } from './dto/create-blog-post.dto';
import type { UpdateBlogPostDto } from './dto/update-blog-post.dto';

const authorSelect = {
  id: true,
  firstName: true,
  lastName: true,
} as const;

const BLOG_MEDIA_DIR = path.resolve(
  process.cwd(),
  'apps/web/public/blog-media',
);
const BLOG_MEDIA_PREFIX = '/blog-media';

@Injectable()
export class BlogService {
  private static readonly MAX_LIMIT = 100;
  private mediaDirReady = false;

  constructor(private readonly prisma: PrismaService) {}

  async listPosts(limit = 25, status?: 'draft' | 'published') {
    const take = this.clampLimit(limit, BlogService.MAX_LIMIT);
    const where: Prisma.BlogPostWhereInput = {};

    if (status === 'draft') {
      where.published = false;
    } else if (status === 'published') {
      where.published = true;
    }

    const [items, published, drafts] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        take,
        orderBy: [
          { published: 'desc' },
          { featured: 'desc' },
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        include: { author: { select: authorSelect } },
      }),
      this.prisma.blogPost.count({ where: { published: true } }),
      this.prisma.blogPost.count({ where: { published: false } }),
    ]);

    return {
      items,
      stats: {
        total: published + drafts,
        published,
        drafts,
      },
    };
  }

  async getPostById(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: { author: { select: authorSelect } },
    });

    if (!post) {
      throw new NotFoundException('Blogpost nicht gefunden');
    }

    return post;
  }

  async getPostBySlug(slug: string, opts?: { includeDraft?: boolean }) {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug },
      include: { author: { select: authorSelect } },
    });

    if (!post) {
      throw new NotFoundException('Blogpost nicht gefunden');
    }

    if (!opts?.includeDraft && !post.published) {
      throw new NotFoundException('Blogpost nicht veröffentlicht');
    }

    return post;
  }

  async listPublicPosts(limit = 9) {
    const take = this.clampLimit(limit, 50);

    const items = await this.prisma.blogPost.findMany({
      where: { published: true },
      take,
      orderBy: [
        { featured: 'desc' },
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      include: { author: { select: authorSelect } },
    });

    return { items };
  }

  async getPublishedPost(slug: string) {
    return this.getPostBySlug(slug, { includeDraft: false });
  }

  async createPost(dto: CreateBlogPostDto, actor?: AuthUser) {
    const slug = await this.ensureSlug(dto.slug ?? dto.title);
    const published = dto.published ?? false;
    const publishedAt = published ? this.normalizeDate(dto.publishedAt) : null;

    const coverImage = await this.persistCoverImage(dto.coverImage);

    const post = await this.prisma.blogPost.create({
      data: {
        title: dto.title.trim(),
        slug,
        excerpt: this.cleanString(dto.excerpt),
        content: dto.content.trim(),
        coverImage,
        featured: dto.featured ?? false,
        published,
        publishedAt,
        authorId: actor?.sub ?? undefined,
      },
      include: { author: { select: authorSelect } },
    });

    return post;
  }

  async updatePost(id: string, dto: UpdateBlogPostDto, actor?: AuthUser) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Blogpost nicht gefunden');
    }

    const data: Prisma.BlogPostUpdateInput = {};

    if (dto.title) {
      data.title = dto.title.trim();
    }

    if (dto.excerpt !== undefined) {
      data.excerpt = this.cleanString(dto.excerpt) ?? null;
    }

    if (dto.content) {
      data.content = dto.content.trim();
    }

    if (dto.coverImage !== undefined) {
      const stored = await this.persistCoverImage(dto.coverImage);
      data.coverImage = stored ?? null;
    }

    if (dto.featured !== undefined) {
      data.featured = dto.featured;
    }

    if (dto.slug !== undefined) {
      const trimmed = dto.slug.trim();
      if (!trimmed) {
        throw new BadRequestException('Slug darf nicht leer sein');
      }

      if (trimmed !== existing.slug) {
        data.slug = await this.ensureSlug(trimmed, existing.id);
      }
    }

    if (dto.published !== undefined) {
      data.published = dto.published;
      data.publishedAt = dto.published
        ? this.normalizeDate(
            dto.publishedAt ?? existing.publishedAt ?? undefined,
          )
        : null;
    } else if (dto.publishedAt !== undefined) {
      data.publishedAt = dto.publishedAt
        ? this.normalizeDate(dto.publishedAt)
        : null;
    }

    if (actor?.sub && !existing.authorId) {
      data.author = {
        connect: { id: actor.sub },
      };
    }

    const post = await this.prisma.blogPost.update({
      where: { id },
      data,
      include: { author: { select: authorSelect } },
    });

    return post;
  }

  async deletePost(id: string) {
    await this.prisma.blogPost.delete({ where: { id } });
  }

  private async ensureSlug(input: string, ignoreId?: string) {
    const base = this.slugify(input);
    if (!base) {
      throw new BadRequestException('Slug konnte nicht generiert werden');
    }

    let candidate = base;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.blogPost.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing || existing.id === ignoreId) {
        return candidate;
      }

      counter += 1;
      candidate = `${base}-${counter}`;
    }
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private normalizeDate(value?: Date | null) {
    if (!value) {
      return new Date();
    }

    return new Date(value);
  }

  private cleanString(value?: string | null) {
    if (value === undefined || value === null) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  private async persistCoverImage(value?: string | null) {
    const cleaned = this.cleanString(value);
    if (!cleaned) {
      return undefined;
    }

    if (cleaned.startsWith(BLOG_MEDIA_PREFIX)) {
      return cleaned;
    }

    if (cleaned.startsWith('data:image/')) {
      return this.saveBase64Image(cleaned);
    }

    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      return this.saveRemoteImage(cleaned);
    }

    return cleaned;
  }

  private async ensureMediaDir() {
    if (this.mediaDirReady) {
      return;
    }
    await fs.mkdir(BLOG_MEDIA_DIR, { recursive: true });
    this.mediaDirReady = true;
  }

  private extensionFromMime(mime: string) {
    if (!mime) {
      return null;
    }
    if (mime.includes('jpeg') || mime.includes('jpg')) {
      return 'jpg';
    }
    if (mime.includes('png')) {
      return 'png';
    }
    if (mime.includes('webp')) {
      return 'webp';
    }
    if (mime.includes('gif')) {
      return 'gif';
    }
    if (mime.includes('svg')) {
      return 'svg';
    }
    return null;
  }

  private async saveBase64Image(payload: string) {
    const match = payload.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(?<data>.+)$/,
    );
    if (!match?.groups?.data) {
      throw new BadRequestException('Ungültiges Cover-Bild.');
    }
    const mime = match[1];
    const extension = this.extensionFromMime(mime) ?? 'png';
    const buffer = Buffer.from(match.groups.data, 'base64');
    const filename = `${Date.now()}-${randomUUID()}.${extension}`;
    await this.writeFile(filename, buffer);
    return `${BLOG_MEDIA_PREFIX}/${filename}`;
  }

  private async saveRemoteImage(url: string) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      return url;
    }

    if (!response.ok) {
      return url;
    }

    const mime = response.headers.get('content-type') ?? '';
    const buffer = Buffer.from(await response.arrayBuffer());
    const extension =
      this.extensionFromMime(mime) ??
      (path.extname(new URL(url).pathname).replace('.', '') || 'jpg');
    const filename = `${Date.now()}-${randomUUID()}.${extension}`;
    await this.writeFile(filename, buffer);
    return `${BLOG_MEDIA_PREFIX}/${filename}`;
  }

  private async writeFile(filename: string, buffer: Buffer) {
    await this.ensureMediaDir();
    const target = path.join(BLOG_MEDIA_DIR, filename);
    await fs.writeFile(target, buffer);
  }

  private clampLimit(limit: number, max: number) {
    if (!Number.isFinite(limit)) {
      return max;
    }

    return Math.min(Math.max(Math.floor(limit), 1), max);
  }
}
