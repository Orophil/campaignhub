import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [ClientsModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
