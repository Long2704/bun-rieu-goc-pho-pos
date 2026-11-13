import POSIcon from './POSIcon';
export default function FloatingAddButton({ onClick,disabled=false }: {
    onClick: () => void;disabled?:boolean;
}) { return <button className="pos-floating-add" disabled={disabled} aria-label="Thêm món" title="Thêm món" onClick={onClick}><POSIcon name="plus"/></button>; }
