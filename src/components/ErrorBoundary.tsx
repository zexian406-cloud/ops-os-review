import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * 全局错误边界：捕获子组件渲染异常，防止单页白屏。
 * 显示错误详情 + 返回首页按钮，而非空白页面。
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] caught:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-screen items-center justify-center bg-background-50 p-6">
          <div className="w-full max-w-md rounded-2xl border border-background-200/70 bg-background-50 p-6 shadow-lg">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 mx-auto">
              <i className="ri-error-warning-line text-[24px] text-red-500" aria-hidden />
            </div>
            <h2 className="mt-4 text-center text-lg font-bold text-foreground-950">
              页面渲染出错
            </h2>
            <p className="mt-1 text-center text-sm text-foreground-500">
              请尝试刷新页面，或返回首页继续操作
            </p>
            {this.state.error && (
              <details className="mt-4 rounded-lg border border-background-200 bg-background-100 p-3 text-[12px] text-foreground-600">
                <summary className="cursor-pointer font-medium text-foreground-700">
                  错误详情
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all text-[11px] text-red-600">
                  {this.state.error.message}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-foreground-400">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 rounded-lg bg-primary-500 py-2 text-[13px] font-semibold text-white hover:bg-primary-600 cursor-pointer"
              >
                刷新页面
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: undefined, errorInfo: undefined });
                  window.location.href = "/";
                }}
                className="flex-1 rounded-lg border border-background-300 bg-background-50 py-2 text-[13px] font-medium text-foreground-600 hover:bg-background-100 cursor-pointer"
              >
                返回首页
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
