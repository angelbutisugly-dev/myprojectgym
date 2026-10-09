import React, { useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Package,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import {
  DeletedMembershipRecord,
  DeletedProductRecord,
  DeletedShopOrderRecord,
  ProductCategory,
  RateMode,
} from '../types';

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  membresias: 'Membresías',
  agua_hidratacion: 'Agua e Hidratación',
  jugos_saludables: 'Jugos Saludables',
  alimentos: 'Alimentos Saludables',
  ropa_deportiva: 'Ropa Deportiva',
};

const RATE_MODE_LABELS: Record<RateMode, string> = {
  auto_bcv: 'Dólar BCV',
  auto_euro: 'Euro BCV',
  manual: 'Tasa Manual',
};

interface DeletedMembershipsReportProps {
  deletedMemberships: DeletedMembershipRecord[];
  deletedProducts: DeletedProductRecord[];
  deletedShopOrders: DeletedShopOrderRecord[];
  lastLocalDownloadAt: string | null;
  onRestoreMembership: (record: DeletedMembershipRecord) => Promise<void>;
  onDeleteReportItem: (record: DeletedMembershipRecord) => void;
  onClearAllDeletedReports: () => void;
  onRestoreProduct: (record: DeletedProductRecord) => Promise<void>;
  onDeleteProductReportItem: (record: DeletedProductRecord) => void;
  onClearAllDeletedProductsReport: () => void;
  onRestoreShopOrder: (record: DeletedShopOrderRecord) => Promise<void>;
  onDeleteShopOrderReportItem: (record: DeletedShopOrderRecord) => void;
  onClearAllDeletedShopOrdersReport: () => void;
  onDownloadDeletedCsv: () => void;
  onDownloadAllOrganizedExcel: () => void;
  onDownloadAllOrganizedJson: () => void;
}

export const DeletedMembershipsReport: React.FC<DeletedMembershipsReportProps> = ({
  deletedMemberships,
  deletedProducts,
  deletedShopOrders,
  lastLocalDownloadAt,
  onRestoreMembership,
  onDeleteReportItem,
  onClearAllDeletedReports,
  onRestoreProduct,
  onDeleteProductReportItem,
  onClearAllDeletedProductsReport,
  onRestoreShopOrder,
  onDeleteShopOrderReportItem,
  onClearAllDeletedShopOrdersReport,
  onDownloadDeletedCsv,
  onDownloadAllOrganizedExcel,
  onDownloadAllOrganizedJson,
}) => {
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<
    | { mode: 'single_mem'; record: DeletedMembershipRecord }
    | { mode: 'all_mem' }
    | { mode: 'single_prod'; record: DeletedProductRecord }
    | { mode: 'all_prod' }
    | { mode: 'single_order'; record: DeletedShopOrderRecord }
    | { mode: 'all_order' }
    | null
  >(null);

  const totalDeletedUsd = deletedMemberships.reduce((acc, m) => acc + (m.priceUsd || 0), 0);
  const totalDeletedBs = deletedMemberships.reduce((acc, m) => acc + (m.totalBs || 0), 0);

  const totalDeletedProductsUsd = deletedProducts.reduce(
    (acc, p) => acc + (p.basePriceUsd || 0),
    0
  );
  const totalDeletedProductsBs = deletedProducts.reduce((acc, p) => acc + (p.priceBs || 0), 0);

  const totalDeletedOrdersUsd = deletedShopOrders.reduce((acc, o) => acc + (o.totalUsd || 0), 0);
  const totalDeletedOrdersBs = deletedShopOrders.reduce((acc, o) => acc + (o.totalBs || 0), 0);

  const totalDeletedItemsCount =
    deletedMemberships.length + deletedProducts.length + deletedShopOrders.length;

  return (
    <div className="space-y-6">
      {/* REMINDER BANNER TO DOWNLOAD LOCALLY SO NO PAYMENT OR PRODUCT GETS LOST */}
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3 max-w-3xl">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-amber-950">
              Recordatorio de Seguridad: Descarga tu Base de Datos Localmente (Membresías, Catálogo de Productos y Ventas Eliminadas)
            </h2>
            <p className="text-xs text-amber-900 leading-relaxed">
              Todas las membresías, productos del catálogo y ventas de tienda que elimines se conservan en este reporte con sus montos en dólares/bolívares y referencias de Pago Móvil. Te recomendamos descargar periódicamente una copia en{' '}
              <strong>Excel (.CSV)</strong> o <strong>.JSON</strong> en tu computadora.
              {lastLocalDownloadAt ? (
                <span className="block font-mono text-[11px] mt-1 text-amber-800">
                  Última descarga local realizada: {lastLocalDownloadAt}
                </span>
              ) : (
                <span className="block font-semibold text-[11px] mt-1 text-red-700">
                  ⚠️ Aún no has descargado tu respaldo local en esta sesión.
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {totalDeletedItemsCount > 0 && (
            <button
              type="button"
              onClick={onDownloadDeletedCsv}
              className="px-3.5 py-2.5 bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Descargar Reporte de Eliminados (.CSV)</span>
            </button>
          )}
          <button
            type="button"
            onClick={onDownloadAllOrganizedExcel}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Descargar Todo en Excel (.CSV)</span>
          </button>
          <button
            type="button"
            onClick={onDownloadAllOrganizedJson}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar Todo en .JSON</span>
          </button>
        </div>
      </div>

      {/* 1. DELETED MEMBERSHIPS REPORT TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <h3 className="text-base font-bold text-slate-900">
                1. Reporte Histórico de Membresías Eliminadas ({deletedMemberships.length})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Monto total registrado en membresías eliminadas:{' '}
              <strong className="font-mono text-slate-900">
                ${totalDeletedUsd.toFixed(2)} USD = Bs. {totalDeletedBs.toFixed(2)}
              </strong>
            </p>
          </div>

          {deletedMemberships.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onDownloadDeletedCsv}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Descargar Eliminados (.CSV)</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget({ mode: 'all_mem' })}
                className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vaciar Reporte de Membresías Eliminadas</span>
              </button>
            </div>
          )}
        </div>

        {deletedMemberships.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
            No se ha eliminado ninguna membresía. Si eliminas alguna desde la tabla principal,
            quedará guardada aquí con su referencia de pago por seguridad.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-3">Fecha Eliminación</th>
                  <th className="py-3 px-3">Teléfono</th>
                  <th className="py-3 px-3">Cédula (ID)</th>
                  <th className="py-3 px-3">Nombre y Apellido</th>
                  <th className="py-3 px-3 text-right">Monto Pagado ($ / Bs.)</th>
                  <th className="py-3 px-3">Referencia Pago Móvil</th>
                  <th className="py-3 px-3">Vencimiento Original</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {deletedMemberships.map((item) => (
                  <tr key={`${item.id}_${item.deletedAt}`} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {item.deletedAt}
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {item.phone || 'Sin teléfono'}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                      {item.cedula || 'Sin Cédula'}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900">
                      {item.firstName || item.lastName
                        ? `${item.firstName} ${item.lastName}`.trim()
                        : 'Sin Nombre'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                      ${item.priceUsd.toFixed(2)} · Bs. {item.totalBs.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 font-mono text-emerald-800 whitespace-nowrap">
                      {item.paymentRef}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {item.expiresAt}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onRestoreMembership(item)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restaurar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteTarget({ mode: 'single_mem', record: item })
                          }
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                          title="Eliminar permanentemente del reporte"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. DELETED PRODUCTS CATALOG REPORT TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-red-600" />
              <h3 className="text-base font-bold text-slate-900">
                2. Reporte Histórico de Productos Eliminados del Catálogo ({deletedProducts.length})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Registro de productos eliminados de la base de datos de Tienda y Precios (Suma de precios unitarios:{' '}
              <strong className="font-mono text-slate-900">
                ${totalDeletedProductsUsd.toFixed(2)} USD = Bs. {totalDeletedProductsBs.toFixed(2)}
              </strong>
              )
            </p>
          </div>

          {deletedProducts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onDownloadDeletedCsv}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Descargar Eliminados (.CSV)</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget({ mode: 'all_prod' })}
                className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vaciar Reporte de Productos Eliminados</span>
              </button>
            </div>
          )}
        </div>

        {deletedProducts.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
            No se ha eliminado ningún producto del catálogo. Cuando elimines un producto o vacíes la Base de Datos de Productos, aparecerá aquí el reporte exacto de qué fue eliminado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-3">Fecha Eliminación</th>
                  <th className="py-3 px-3">Producto Eliminado</th>
                  <th className="py-3 px-3">Categoría</th>
                  <th className="py-3 px-3">Tasa Asignada</th>
                  <th className="py-3 px-3 text-right">Precio ($ USD / Bs.)</th>
                  <th className="py-3 px-3">Disponibilidad al Eliminar</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {deletedProducts.map((prod) => (
                  <tr key={`${prod.id}_${prod.deletedAt}`} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {prod.deletedAt}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      {prod.name}
                      {prod.description && (
                        <span className="block text-[11px] font-normal text-slate-500">
                          {prod.description}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700 whitespace-nowrap">
                      {CATEGORY_LABELS[prod.category] || prod.category}
                    </td>
                    <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                      {RATE_MODE_LABELS[prod.rateMode] || prod.rateMode}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                      ${prod.basePriceUsd.toFixed(2)} · Bs. {prod.priceBs.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          prod.available !== false
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-300'
                        }`}
                      >
                        {prod.available !== false ? 'Con Stock' : 'Sin Stock (Gris)'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onRestoreProduct(prod)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restaurar al Catálogo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteTarget({ mode: 'single_prod', record: prod })
                          }
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                          title="Eliminar permanentemente del reporte"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. DELETED SHOP ORDERS / PRODUCT SALES REPORT TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-red-600" />
              <h3 className="text-base font-bold text-slate-900">
                3. Reporte Histórico de Ventas de Productos / Pedidos Eliminados ({deletedShopOrders.length})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Monto total registrado en ventas de productos eliminadas:{' '}
              <strong className="font-mono text-slate-900">
                ${totalDeletedOrdersUsd.toFixed(2)} USD = Bs. {totalDeletedOrdersBs.toFixed(2)}
              </strong>
            </p>
          </div>

          {deletedShopOrders.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onDownloadDeletedCsv}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Descargar Eliminados (.CSV)</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget({ mode: 'all_order' })}
                className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vaciar Reporte de Ventas Eliminadas</span>
              </button>
            </div>
          )}
        </div>

        {deletedShopOrders.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
            No se ha eliminado ninguna venta de productos. Si eliminas algún pedido o vacías la Base de Datos de Ventas de Productos, quedará guardado aquí qué se vendió y a quién.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-3">Fecha Eliminación</th>
                  <th className="py-3 px-3">A Quién se Vendió (Cliente / Teléfono)</th>
                  <th className="py-3 px-3">Qué se Vendió (Productos)</th>
                  <th className="py-3 px-3">Categoría / Cuenta</th>
                  <th className="py-3 px-3 text-right">Monto ($ / Bs.)</th>
                  <th className="py-3 px-3">Referencia Pago Móvil</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {deletedShopOrders.map((ord) => (
                  <tr key={`${ord.id}_${ord.deletedAt}`} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {ord.deletedAt}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">
                        {ord.buyerFullName || ord.buyerName || ord.phone}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        Tel: {ord.phone}
                        {ord.buyerCedulaResolved || ord.buyerCedula
                          ? ` · Cédula: ${ord.buyerCedulaResolved || ord.buyerCedula}`
                          : ''}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      {ord.itemsSummary}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      <span className="font-medium">
                        {ord.categoryGroup === 'ropa' ? 'Ropa Deportiva' : 'Consumibles (Tienda)'}
                      </span>
                      <span className="block text-[11px] font-mono text-slate-500">
                        {ord.pagoMovilTarget}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                      ${ord.totalUsd.toFixed(2)} · Bs. {ord.totalBs.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 font-mono text-blue-800 whitespace-nowrap">
                      {ord.paymentRef}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onRestoreShopOrder(ord)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restaurar Venta</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteTarget({ mode: 'single_order', record: ord })
                          }
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                          title="Eliminar permanentemente del reporte"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Secure Confirmation Popup for Deleting Report Items */}
      {confirmDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">
                  {confirmDeleteTarget.mode.startsWith('all_')
                    ? '¿Vaciar Reporte de Eliminados?'
                    : '¿Eliminar Registro del Reporte?'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {confirmDeleteTarget.mode === 'all_mem' && (
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas borrar permanentemente los{' '}
                <strong className="text-slate-900">{deletedMemberships.length} registros</strong> del
                Reporte de Membresías Eliminadas? Esta acción no se puede deshacer.
              </p>
            )}

            {confirmDeleteTarget.mode === 'single_mem' && (
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas borrar permanentemente el registro de{' '}
                <strong className="text-slate-900">
                  {confirmDeleteTarget.record.firstName || confirmDeleteTarget.record.phone}
                </strong>{' '}
                (Operación: <span className="font-mono">{confirmDeleteTarget.record.paymentRef}</span> · $
                {confirmDeleteTarget.record.priceUsd.toFixed(2)}) del historial de eliminados?
              </p>
            )}

            {confirmDeleteTarget.mode === 'all_prod' && (
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas borrar permanentemente los{' '}
                <strong className="text-slate-900">{deletedProducts.length} productos</strong> del
                Reporte de Productos Eliminados? Esta acción no se puede deshacer.
              </p>
            )}

            {confirmDeleteTarget.mode === 'single_prod' && (
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas borrar permanentemente el producto{' '}
                <strong className="text-slate-900">"{confirmDeleteTarget.record.name}"</strong> ($
                {confirmDeleteTarget.record.basePriceUsd.toFixed(2)} USD / Bs.{' '}
                {confirmDeleteTarget.record.priceBs.toFixed(2)}) del historial de eliminados?
              </p>
            )}

            {confirmDeleteTarget.mode === 'all_order' && (
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas borrar permanentemente las{' '}
                <strong className="text-slate-900">{deletedShopOrders.length} ventas de productos</strong>{' '}
                del Reporte de Eliminados? Esta acción no se puede deshacer.
              </p>
            )}

            {confirmDeleteTarget.mode === 'single_order' && (
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas borrar permanentemente la venta de{' '}
                <strong className="text-slate-900">{confirmDeleteTarget.record.itemsSummary}</strong>{' '}
                (Cliente: {confirmDeleteTarget.record.buyerFullName || confirmDeleteTarget.record.phone} ·
                Op: <span className="font-mono">{confirmDeleteTarget.record.paymentRef}</span>) del
                historial de eliminados?
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmDeleteTarget.mode === 'all_mem') {
                    onClearAllDeletedReports();
                  } else if (confirmDeleteTarget.mode === 'single_mem') {
                    onDeleteReportItem(confirmDeleteTarget.record);
                  } else if (confirmDeleteTarget.mode === 'all_prod') {
                    onClearAllDeletedProductsReport();
                  } else if (confirmDeleteTarget.mode === 'single_prod') {
                    onDeleteProductReportItem(confirmDeleteTarget.record);
                  } else if (confirmDeleteTarget.mode === 'all_order') {
                    onClearAllDeletedShopOrdersReport();
                  } else if (confirmDeleteTarget.mode === 'single_order') {
                    onDeleteShopOrderReportItem(confirmDeleteTarget.record);
                  }
                  setConfirmDeleteTarget(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sí, Eliminar Definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
