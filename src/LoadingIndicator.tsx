import './loading-indicator.css';

export default function LoadingIndicator({label='Đang tải dữ liệu'}:{label?:string}){
 return <span className="loading-indicator" role="status">
  <span className="visually-hidden">{label}</span>
  <span className="loading-indicator-ring" aria-hidden="true"/>
 </span>;
}
