import { Component, type ReactNode } from 'react';

/** 지도·그래프 한쪽이 실패해도 나머지 화면은 계속 쓸 수 있게 한다 */
export default class ErrorBoundary extends Component<{ name: string; className: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.name}]`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className={`${this.props.className} pane-error`}>
          <p>{this.props.name}을(를) 표시하지 못했습니다.</p>
          <button onClick={() => this.setState({ error: null })}>다시 시도</button>
        </div>
      );
    }
    return this.props.children;
  }
}
