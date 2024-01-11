# Sample command lines

For talking with minicom, which minics meter, and the MTE REST service with operates a real MTE device:
```
./e355-cali.js -d /dev/pts/6 -t 3p -h localhost -p 6200 \
    -e 1000 --no-ping \
    -l 1:v=241.2e3,i=10e3,phi_v=30.6e3,phi_i=0 \
    -l 2:v=220.2e3,i=20e3,phi_v=120e3,phi_i=120e3 \
    -l 3:v=240e3,i=99.2e3,phi_v=240e3,phi_i=240e3
```
