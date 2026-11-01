import { communitiesRouter } from '@/services/juxt-web/routes/console/communities';
import { showRouter } from '@/services/juxt-web/routes/console/show';
import { postsRouter } from '@/services/juxt-web/routes/console/posts';
import { userPageRouter } from '@/services/juxt-web/routes/console/userpage';
import { feedRouter } from '@/services/juxt-web/routes/console/feed';
import { notificationRouter } from '@/services/juxt-web/routes/console/notifications';
import { topicsRouter } from '@/services/juxt-web/routes/console/topics';
import { loginRouter } from '@/services/juxt-web/routes/web/login';
import { aboutRouter } from '@/services/juxt-web/routes/web/about';
import { welcomeRouter } from '@/services/juxt-web/routes/web/welcome';
import { devicesRouter } from '@/services/juxt-web/routes/web/devices';
import { logoutRouter } from '@/services/juxt-web/routes/web/logout';
import { staticRouter } from '@/services/juxt-web/routes/console/static';
import { entrypointRouter } from '@/services/juxt-web/routes/console/entrypoint';
import { activityRouter } from '@/services/juxt-web/routes/web/activity';
import { baseAdminRouter } from '@/services/juxt-web/routes/admin';

export const routes = {
	PORTAL_SHOW: showRouter,
	PORTAL_COMMUNITIES: communitiesRouter,
	PORTAL_USER: userPageRouter,
	PORTAL_POST: postsRouter,
	PORTAL_FEED: feedRouter,
	PORTAL_NEWS: notificationRouter,
	PORTAL_TOPICS: topicsRouter,
	WEB_LOGIN: loginRouter,
	WEB_ABOUT: aboutRouter,
	WEB_LOGOUT: logoutRouter,
	WEB_WELCOME: welcomeRouter,
	WEB_DEVICES: devicesRouter,
	WEB_ACTIVITY: activityRouter,
	ADMIN: baseAdminRouter,
	STATIC: staticRouter,
	ENTRYPOINT: entrypointRouter
};
