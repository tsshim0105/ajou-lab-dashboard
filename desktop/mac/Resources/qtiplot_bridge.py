"""Fixed trusted bridge. Input is JSON data, never executable source."""
import builtins
import json
import math
import os
import sys
import traceback
import qti

folder = os.path.dirname(os.path.abspath(__file__))
warnings = []
def optional(label, action):
    try:
        action()
    except Exception as exc:
        warnings.append(label + ': ' + str(exc))
def run():
    from PyQt5 import QtCore, QtGui
    with builtins.open(os.path.join(folder, 'input.json'), encoding='utf-8') as f:
        payload = json.load(f)
    names, rows, s = payload['names'], payload['data'], payload['settings']
    if not 2 <= len(names) <= 13 or not 1 <= len(rows) <= 10000:
        raise ValueError('열 또는 행 수가 허용 범위를 벗어났습니다.')
    def numeric(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    if any(len(r) != len(names) or not numeric(r[0]) or any(v is not None and not numeric(v) for v in r[1:]) for r in rows):
        raise ValueError('숫자 데이터를 확인해 주세요.')
    for key, lo, hi in [('width',400,2400),('height',300,1800),('line',.5,12),('font',8,72),('legendFont',8,48),('marker',2,20)]:
        if not numeric(s[key]) or not lo <= s[key] <= hi:
            raise ValueError('그래프 설정 범위 오류: '+key)
    modes = {'line':qti.Layer.LineSymbols,'scatter':qti.Layer.Scatter,'bar':qti.Layer.VerticalBars}
    if s['type'] not in modes:
        raise ValueError('지원하지 않는 그래프 종류입니다.')
    t = qti.app.newTable('Hub'+os.path.basename(folder).replace('-','')[:12],len(rows),len(names))
    for c, name in enumerate(names,1):
        optional('열 제목',lambda c=c,name=name:t.setColName(c,str(name)[:120]))
    for r, row in enumerate(rows,1):
        for c, value in enumerate(row,1):
            if value is not None:
                t.setCell(c,r,value)
    t.setColumnRole(1,qti.Table.X)
    g = qti.app.plot(t,tuple(range(2,len(names)+1)),modes[s['type']])
    l = g.activeLayer()
    l.setTitle(str(s.get('title',''))[:300])
    l.setAxisTitle(qti.Layer.Bottom,str(s.get('xLabel','X'))[:300])
    l.setAxisTitle(qti.Layer.Left,str(s.get('yLabel','Y'))[:300])
    g.setScaleLayersOnResize(False)
    l.setAutoscaleFonts(False)
    palette = ['#2563eb','#dc2626','#059669','#9333ea','#d97706','#0891b2']
    styles = {'circle':0,'square':1,'diamond':2,'triangle':3,'cross':9,'none':-1}
    for j in range(len(names)-1):
        cfg = s.get('series',[])[j] if j < len(s.get('series',[])) else {}
        color = QtGui.QColor(cfg.get('color',palette[j%6]))
        if not color.isValid(): raise ValueError('색상 값이 잘못되었습니다.')
        l.setCurveLineColor(j,color)
        l.setCurveLineWidth(j,s['line'])
        curve = l.curve(j)
        symbol = curve.symbol()
        optional('기호',lambda symbol=symbol,cfg=cfg:symbol.setStyle(styles.get(cfg.get('shape','circle'),0)))
        optional('기호 크기',lambda symbol=symbol:symbol.setSize(QtCore.QSize(int(s['marker']),int(s['marker']))))
        optional('기호 색상',lambda symbol=symbol,color=color:symbol.setBrush(QtGui.QBrush(color)))
        optional('기호 테두리',lambda symbol=symbol,color=color:symbol.setPen(QtGui.QPen(color)))
    font = QtGui.QFont('Arial');font.setPixelSize(int(s['font']))
    for axis in [qti.Layer.Bottom,qti.Layer.Left]:
        optional('축 글꼴',lambda axis=axis:l.setAxisFont(axis,font))
        optional('축 제목 글꼴',lambda axis=axis:l.setAxisTitleFont(axis,font))
    legend_font = QtGui.QFont('Arial');legend_font.setPixelSize(int(s['legendFont']))
    legend = l.legend()
    if legend: legend.setFont(legend_font)
    # Four-sided frame; six major marks, four minor marks per interval.
    l.enableAutoscaling(False)
    l.setSynchronizedScaleDivisions(False)
    for axis in [qti.Layer.Bottom,qti.Layer.Left,qti.Layer.Top,qti.Layer.Right]:
        l.enableAxis(axis)
        l.setMajorTicksType(axis,qti.Layer.In)
        l.setMinorTicksType(axis,qti.Layer.In)
        l.setAxisTicksLength(axis,qti.Layer.In,qti.Layer.In,4,7)
    for axis in [qti.Layer.Top,qti.Layer.Right]:
        l.enableAxisLabels(axis,False)
        l.setAxisTitle(axis,'')
    for axes, prefix, values in [([qti.Layer.Bottom,qti.Layer.Top],'x',[r[0] for r in rows]),([qti.Layer.Left,qti.Layer.Right],'y',[v for r in rows for v in r[1:] if v is not None])]:
        low, high = min(values),max(values)
        if prefix == 'y' and s['type'] == 'bar':
            low,high=min(0,low),max(0,high)
        if low == high:
            delta=abs(low)*.1 or 1
            low,high=low-delta,high+delta
        else:
            delta=(high-low)*.05
            low,high=low-delta,high+delta
        low=float(s[prefix+'min']) if s.get(prefix+'min','') != '' else low
        high=float(s[prefix+'max']) if s.get(prefix+'max','') != '' else high
        if not math.isfinite(low) or not math.isfinite(high) or low >= high:
            raise ValueError('축 범위가 올바르지 않습니다.')
        for axis in axes:
            l.setScale(axis,low,high,(high-low)/5,6,4)
    # A canvas frame avoids small gaps where QtiPlot axis backbones meet.
    l.drawAxesBackbones(False)
    l.setCanvasFrame(1,QtGui.QColor('#111111'))
    if s.get('grid'): warnings.append('격자선은 QtiPlot에서 확인·조정해 주세요.')
    l.replot()
    # Width and height refer to the canvas, never the complete image.
    margin_x = int(s['font']*7+40)
    margin_y = int(s['font']*4+40)
    g.resize(int(s['width'])+margin_x+60,int(s['height'])+margin_y+100)
    l.setCanvasGeometry(margin_x,80,int(s['width']),int(s['height']))
    l.replot()
    size = QtCore.QSizeF()
    g.exportImage(os.path.join(folder,'graph.png'),100,False,0,size,qti.Frame.Pixel)
    g.exportVector(os.path.join(folder,'graph.svg'),size,qti.Frame.Pixel)
    for name in ['graph.png','graph.svg']:
        if not os.path.isfile(os.path.join(folder,name)) or os.path.getsize(os.path.join(folder,name)) == 0:
            raise RuntimeError('결과 파일이 생성되지 않았습니다: '+name)
    return {'ok':True,'warnings':warnings,'message':'QtiPlot 그래프와 PNG·SVG를 생성했습니다.'}
try:
    result = run()
except Exception as exc:
    result = {'ok':False,'error':str(exc)}
    with builtins.open(os.path.join(folder,'error.txt'),'w',encoding='utf-8') as f:
        f.write(traceback.format_exc())
with builtins.open(os.path.join(folder,'result.tmp'),'w',encoding='utf-8') as f:
    json.dump(result,f,ensure_ascii=False)
os.replace(os.path.join(folder,'result.tmp'),os.path.join(folder,'result.json'))
