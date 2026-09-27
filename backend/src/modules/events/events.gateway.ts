import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { ClientsService } from '../clients/clients.service';
import { PostStatus, Role } from '../../common/enums';

export interface PostStatusEvent {
  postId: string;
  clientId: string;
  brandName: string;
  platform: string;
  captionPreview: string;
  fromStatus: PostStatus | null;
  toStatus: PostStatus;
  actorName: string;
  at: string;
}

export interface PostChangedEvent {
  postId: string;
  clientId: string;
  kind: 'edited' | 'commented' | 'created';
}

const STAFF_ROOM = 'staff';
const clientRoom = (id: string) => `client:${id}`;

/**
 * Socket.IO gateway. Clients authenticate with `auth: { token }`. Admins and
 * creators join the "staff" room (all posts); reviewers only join the rooms of
 * clients assigned to them, so they never receive events for other brands.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class EventsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly clients: ClientsService,
  ) {}

  async handleConnection(socket: Socket) {
    const token = (socket.handshake.auth?.token as string | undefined) ?? '';
    const user = token ? await this.auth.verifyToken(token) : null;
    if (!user) {
      socket.emit('error', { message: 'Unauthorized' });
      socket.disconnect(true);
      return;
    }
    if (user.role === Role.REVIEWER) {
      const ids = await this.clients.assignedClientIds(user.id);
      await socket.join(ids.map(clientRoom));
    } else {
      await socket.join(STAFF_ROOM);
    }
  }

  emitStatusChange(event: PostStatusEvent) {
    if (!this.server) return;
    this.server.to([STAFF_ROOM, clientRoom(event.clientId)]).emit('post:status', event);
  }

  emitChanged(event: PostChangedEvent) {
    if (!this.server) return;
    this.server.to([STAFF_ROOM, clientRoom(event.clientId)]).emit('post:changed', event);
  }
}
