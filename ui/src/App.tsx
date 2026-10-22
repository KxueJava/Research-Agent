import React from 'react';
import { ConfigProvider } from 'antd';
import { RouterProvider } from 'react-router-dom';
import zhCN from 'antd/locale/zh_CN';
import router from './router';
import ThemeProvider from './components/ThemeProvider';
import {UiFeaturesProvider} from './components/genui/UiFeatures';

// App 组件：应用的根组件，设置全局配置和路由
const App: ResearchType.FC = React.memo(() => {
  return (
    <ConfigProvider locale={zhCN}>
      <ThemeProvider>
        <UiFeaturesProvider><RouterProvider router={router} /></UiFeaturesProvider>
      </ThemeProvider>
    </ConfigProvider>
  );
});

export default App;
