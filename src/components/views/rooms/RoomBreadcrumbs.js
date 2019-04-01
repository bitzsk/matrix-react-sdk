/*
Copyright 2019 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';
import React from "react";
import dis from "../../../dispatcher";
import MatrixClientPeg from "../../../MatrixClientPeg";
import AccessibleButton from '../elements/AccessibleButton';
import RoomAvatar from '../avatars/RoomAvatar';
import classNames from 'classnames';
import sdk from "../../../index";
import * as RoomNotifs from '../../../RoomNotifs';
import * as FormattingUtils from "../../../utils/FormattingUtils";

const MAX_ROOMS = 20;

export default class RoomBreadcrumbs extends React.Component {
    constructor(props) {
        super(props);
        this.state = {rooms: []};
        this.onAction = this.onAction.bind(this);
        this._dispatcherRef = null;
    }

    componentWillMount() {
        this._dispatcherRef = dis.register(this.onAction);

        const roomStr = localStorage.getItem("mx_breadcrumb_rooms");
        if (roomStr) {
            try {
                const roomIds = JSON.parse(roomStr);
                this.setState({
                    rooms: roomIds.map((r) => {
                        return {
                            room: MatrixClientPeg.get().getRoom(r),
                            animated: false,
                        };
                    }).filter((r) => r.room),
                });
            } catch (e) {
                console.error("Failed to parse breadcrumbs:", e);
            }
        }

        MatrixClientPeg.get().on("Room.myMembership", this.onMyMembership);
        MatrixClientPeg.get().on("Room.receipt", this.onRoomReceipt);
        MatrixClientPeg.get().on("Room.timeline", this.onRoomTimeline);
        MatrixClientPeg.get().on("Event.decrypted", this.onEventDecrypted);
    }

    componentWillUnmount() {
        dis.unregister(this._dispatcherRef);

        const client = MatrixClientPeg.get();
        if (client) {
            client.removeListener("Room.myMembership", this.onMyMembership);
            client.removeListener("Room.receipt", this.onRoomReceipt);
            client.removeListener("Room.timeline", this.onRoomTimeline);
            client.removeListener("Event.decrypted", this.onEventDecrypted);
        }
    }

    componentDidUpdate() {
        const rooms = this.state.rooms.slice();

        if (rooms.length) {
            const {room, animated} = rooms[0];
            if (!animated) {
                rooms[0] = {room, animated: true};
                setTimeout(() => this.setState({rooms}), 0);
            }
        }

        const roomStr = JSON.stringify(rooms.map((r) => r.room.roomId));
        localStorage.setItem("mx_breadcrumb_rooms", roomStr);
    }

    onAction(payload) {
        switch (payload.action) {
            case 'view_room':
                this._appendRoomId(payload.room_id);
                break;
        }
    }

    onMyMembership = (room, membership) => {
        if (membership === "leave" || membership === "ban") {
            // Force left rooms to render appropriately
            this.forceUpdate();
        }
    };

    onRoomReceipt = (event, room) => {
        if (this.state.rooms.map(r => r.room.roomId).includes(room.roomId)) {
            this.forceUpdate();
        }
    };

    onRoomTimeline = (event, room) => {
        if (this.state.rooms.map(r => r.room.roomId).includes(room.roomId)) {
            this.forceUpdate();
        }
    };

    onEventDecrypted = (event) => {
        if (this.state.rooms.map(r => r.room.roomId).includes(event.getRoomId())) {
            this.forceUpdate();
        }
    };

    _appendRoomId(roomId) {
        const room = MatrixClientPeg.get().getRoom(roomId);
        if (!room) {
            return;
        }
        const rooms = this.state.rooms.slice();
        const existingIdx = rooms.findIndex((r) => r.room.roomId === room.roomId);
        if (existingIdx !== -1) {
            rooms.splice(existingIdx, 1);
        }
        rooms.splice(0, 0, {room, animated: false});
        if (rooms.length > MAX_ROOMS) {
            rooms.splice(MAX_ROOMS, rooms.length - MAX_ROOMS);
        }
        this.setState({rooms});
    }

    _viewRoom(room) {
        dis.dispatch({action: "view_room", room_id: room.roomId});
    }

    _onMouseEnter(room) {
        this._onHover(room);
    }

    _onMouseLeave(room) {
        this._onHover(null); // clear hover states
    }

    _onHover(room) {
        const rooms = this.state.rooms.slice();
        for (const r of rooms) {
            r.hover = room && r.room.roomId === room.roomId;
        }
        this.setState({rooms});
    }

    render() {
        const Tooltip = sdk.getComponent('elements.Tooltip');
        const IndicatorScrollbar = sdk.getComponent('structures.IndicatorScrollbar');

        // check for collapsed here and not at parent so we keep rooms in our state
        // when collapsing and expanding
        if (this.props.collapsed) {
            return null;
        }

        const rooms = this.state.rooms;
        const avatars = rooms.map(({room, animated, hover}, i) => {
            const isFirst = i === 0;
            const classes = classNames({
                "mx_RoomBreadcrumbs_crumb": true,
                "mx_RoomBreadcrumbs_preAnimate": isFirst && !animated,
                "mx_RoomBreadcrumbs_animate": isFirst,
                "mx_RoomBreadcrumbs_left": !['invite', 'join'].includes(room.getMyMembership()),
            });

            let tooltip = null;
            if (hover) {
                tooltip = <Tooltip label={room.name} />;
            }

            let badge;
            const notifState = RoomNotifs.getRoomNotifsState(room.roomId);
            if (RoomNotifs.MENTION_BADGE_STATES.includes(notifState)) {
                const highlightNotifs = RoomNotifs.getUnreadNotificationCount(room, 'highlight');
                const unreadNotifs = RoomNotifs.getUnreadNotificationCount(room);

                const redBadge = highlightNotifs > 0;
                const greyBadge = redBadge || (unreadNotifs > 0 && RoomNotifs.BADGE_STATES.includes(notifState));

                if (redBadge || greyBadge) {
                    const notifCount = redBadge ? highlightNotifs : unreadNotifs;
                    const limitedCount = FormattingUtils.formatCount(notifCount);

                    // HACK: We are abusing the RoomTile badge styles here
                    const badgeClasses = classNames({
                        'mx_RoomTile_badge': true,
                        'mx_RoomTile_badgeButton': true,
                        'mx_RoomTile_badgeRed': redBadge,
                        'mx_RoomTile_badgeUnread': !redBadge,
                    });

                    badge = <div className={badgeClasses}>{limitedCount}</div>;
                }
            }

            return (
                <AccessibleButton className={classes} key={room.roomId} onClick={() => this._viewRoom(room)}
                    onMouseEnter={() => this._onMouseEnter(room)} onMouseLeave={() => this._onMouseLeave(room)}>
                    <RoomAvatar room={room} width={32} height={32} />
                    {badge}
                    {tooltip}
                </AccessibleButton>
            );
        });
        return (
            <IndicatorScrollbar ref="scroller" className="mx_RoomBreadcrumbs" trackHorizontalOverflow={true}>
                { avatars }
            </IndicatorScrollbar>
        );
    }
}
