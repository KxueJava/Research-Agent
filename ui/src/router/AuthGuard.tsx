import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loading } from "@/components";
import {
  adminUserApi,
  getAccessToken,
  storeAdminUser,
} from "@/services/adminUser";
import { refreshAccessToken } from "@/utils/request";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      // 用户缓存只用于显示资料，不能作为登录态的必要条件；有效 Access Token
      // 即使在缓存被清理或跨标签页同步失败时，也应该先向服务端确认身份。
      if (getAccessToken()) {
        try {
          const user = await adminUserApi.me();
          if (user) {
            storeAdminUser(user);
          }
          if (active && user) {
            setAuthenticated(true);
            setChecking(false);
          }
          if (user) return;
        } catch {
          // Access Token 可能已撤销；下面尝试用 Refresh Token 恢复会话。
        }
      }
      if (active) {
        try {
          const token = await refreshAccessToken();
          const user = token ? await adminUserApi.me() : null;
          if (active && user) {
            storeAdminUser(user);
            setAuthenticated(true);
          }
        } catch {
          if (active) setAuthenticated(false);
        }
      }
      if (active) setChecking(false);
    };
    void restore();
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return <Loading loading={true} className="h-full" />;
  }
  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
