import LoadingIndicator from './LoadingIndicator';
import {Component,Suspense} from 'react';
import type {ReactNode} from 'react';

type Props={children:ReactNode;onBack:()=>void};
export default class DeferredPanel extends Component<Props,{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(this.state.failed)return <section role="alert"><h2>Chưa tải được màn hình này.</h2><p>Kiểm tra kết nối. Bạn vẫn có thể tiếp tục phục vụ; mở lại app sau khi hoàn tất các thao tác đang chờ để thử tải lại.</p><button onClick={this.props.onBack}>Về Phục vụ</button></section>;
  return <Suspense fallback={<LoadingIndicator label="Đang tải"/>}>{this.props.children}</Suspense>;
 }
}
