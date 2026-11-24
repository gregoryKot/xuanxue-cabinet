import numpy as np, wave, sys
A=[float(x)/1000 for x in sys.argv[2:]]
SR=44100; D=A[0]; DONE=A[1]; TAPS=A[2:]; n=int(SR*D); out=np.zeros(n)
f=lambda m:440*2**((m-69)/12)
def note(t0,m,dur=1.2,vol=.2,decay=4.0,harm=(1,.35,.12)):
    i=int(t0*SR); k=min(int(dur*SR),n-i)
    if k<=0: return
    t=np.arange(k)/SR; s=sum(a*np.sin(2*np.pi*f(m)*(h+1)*t) for h,a in enumerate(harm))
    env=np.exp(-decay*t)*np.minimum(t/.006,1); out[i:i+k]+=vol*s*env
def pad(t0,ms,dur):
    i=int(t0*SR); k=min(int(dur*SR),n-i); t=np.arange(k)/SR
    env=np.minimum(t/.8,1)*np.minimum((dur-t)/.8,1)
    for m in ms: out[i:i+k]+=.035*np.sin(2*np.pi*f(m)*t)*env
beat=.55
chords=[(48,[60,64,67,72,76]),(45,[57,60,64,69,72]),(41,[53,57,60,65,69]),(43,[55,59,62,67,71])]
pat=[0,2,1,3,2,4]
for b in range(int(D/(beat*6))+1):
    root,ch=chords[b%4]; t0=b*beat*6
    pad(t0,[root,root+7,ch[1]],beat*6+.4); note(t0,root,2.5,.16,1.5,(1,.2))
    for j,p in enumerate(pat):
        if t0+j*beat<DONE+.3: note(t0+j*beat,ch[p]+12,1.4,.15)
for tp in TAPS:  # касания
    note(tp,84,.25,.14,22,(1,.1)); note(tp,96,.2,.06,30,(1,))
for j,m in enumerate((72,76,79,84,88)): note(DONE+.52+j*.11,m+12,2.2,.17,2.2)  # финал
# лёгкое эхо и края
d=int(.33*SR); out[d:]+=.28*out[:-d]
t=np.arange(n)/SR; out*=np.minimum(t/.25,1)*np.minimum((D-t)/.9,1)
out=out/np.abs(out).max()*.7
w=wave.open(sys.argv[1],'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out*32767).astype('<i2').tobytes()); w.close()
