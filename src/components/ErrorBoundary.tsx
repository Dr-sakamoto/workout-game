import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// 描画中の例外1つでアプリ全体が白画面になるのを防ぐ。データは localStorage に
// 残っているので実際には失われていないが、ユーザーには全損に見えてしまう。
// ここで受け止めて「データは無事」であることと復旧手段(再読み込み)を伝える。
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 開発時の調査用。将来は Sentry 等へ送る
    console.error("画面の描画でエラーが発生しました", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app">
        <div className="screen">
          <div className="panel error-panel">
            <h2>😵 問題が発生しました</h2>
            <p className="hint" style={{ margin: "10px 0", lineHeight: 1.6 }}>
              画面の表示中にエラーが起きました。<br />
              でも安心してください——<b>あなたのデータ（アバター・記録）は端末内に
              そのまま残っています</b>。<br />
              下のボタンで再読み込みすれば、たいていは元に戻ります。
            </p>
            <button className="btn green full" onClick={() => location.reload()}>
              🔄 再読み込みする
            </button>
            <p className="hint" style={{ marginTop: 12 }}>
              何度も起きる場合は、設定からバックアップを書き出して保管してください。
            </p>
            <details className="adv-input" style={{ marginTop: 12 }}>
              <summary>エラーの詳細（開発者向け）</summary>
              <pre className="error-detail">{String(this.state.error?.stack ?? this.state.error)}</pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
}
