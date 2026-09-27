import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { EventsModule } from '../events/events.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PublisherService } from './publisher.service';

@Module({
  imports: [ClientsModule, EventsModule],
  controllers: [PostsController],
  providers: [PostsService, PublisherService],
})
export class PostsModule {}
