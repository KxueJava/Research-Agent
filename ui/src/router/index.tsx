import React, { Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import Layout from '@/layout/index';
import { Loading } from '@/components';
import { ROUTES } from './routes';
import AuthGuard from './AuthGuard';

// 使用 React.lazy 懒加载组件
const Home = React.lazy(() => import('@/pages/Home'));
const FeaturedConversationDetail = React.lazy(
  () => import('@/pages/FeaturedConversationDetail')
);
const NotFound = React.lazy(() => import('@/components/NotFound'));
const Login = React.lazy(() => import('@/pages/Login'));
const Profile = React.lazy(() => import('@/pages/Profile'));

const suspense = (element: React.ReactNode) => (
  <Suspense fallback={<Loading loading={true} className="h-full" />}>
    {element}
  </Suspense>
);

/**
 * 工作区视图全部由 Home 承载。
 *
 * <p>Home 自己渲染侧栏，并根据 URL 决定内嵌哪个工作区（见 `pages/Home/viewRoutes.ts`）。
 * 这里曾经为每个工作区注册了独立页面，导致同一功能有两套入口：从侧栏进入的是内嵌版
 * （URL 停在 "/"，刷新即丢失视图），从这些路由进入的是没有侧栏的独立版。两套并存既
 * 让刷新行为不一致，也让"用户在哪里"没有唯一答案。现在只保留一套。</p>
 *
 * <p>仍保留独立页面的只有真正的详情/独立场景：登录、账号设置、精品对话详情、404。</p>
 */
const homeElement = suspense(<Home />);

// 创建路由配置
const router = createBrowserRouter([
  {
    path: ROUTES.LOGIN,
    element: suspense(<Login />),
  },
  {
    path: ROUTES.HOME,
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      {
        path: ROUTES.PROFILE,
        element: suspense(<Profile />),
      },
      {
        index: true,
        element: homeElement,
      },
      {
        path: ROUTES.USAGE,
        element: homeElement,
      },
      {
        path: ROUTES.FEATURED_CONVERSATIONS,
        element: homeElement,
      },
      {
        path: ROUTES.FEATURED_CONVERSATION_DETAIL,
        element: suspense(<FeaturedConversationDetail />),
      },
      {
        path: ROUTES.WORKSPACE,
        element: <Navigate to={ROUTES.WORKSPACE_MRAG} replace />,
      },
      {
        path: ROUTES.WORKSPACE_MRAG,
        element: homeElement,
      },
      {
        path: ROUTES.WORKSPACE_IMAGE_GENERATION,
        element: homeElement,
      },
      {
        path: ROUTES.WORKSPACE_SOP,
        element: homeElement,
      },
      {
        path: ROUTES.WORKSPACE_SUB_AGENTS,
        element: homeElement,
      },
      {
        path: ROUTES.WORKSPACE_MODELS,
        element: homeElement,
      },
      {
        path: ROUTES.WORKSPACE_CAPABILITIES,
        element: homeElement,
      },
      {
        path: ROUTES.NOT_FOUND,
        element: suspense(<NotFound />),
      },
    ],
  },
  // 重定向所有未匹配的路由到 404 页面
  {
    path: '*',
    element: <Navigate to={ROUTES.NOT_FOUND} replace />,
  },
]);

export default router;
