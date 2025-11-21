import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { BlogService } from './blog.service';

@Controller({
  path: 'public/blog',
  version: '1',
})
export class PublicBlogController {
  constructor(private readonly blogService: BlogService) {}

  @Public()
  @Get()
  list(@Query('limit', new DefaultValuePipe(9), ParseIntPipe) limit: number) {
    return this.blogService.listPublicPosts(limit);
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.blogService.getPublishedPost(slug);
  }
}
