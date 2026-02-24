CC = clang
CFLAGS = -g -Wall
LIB = -linput -ludev -lsystemd
OBJ=kwin_gesture.o
build: $(OBJ)
	$(CC) $(LIB) $(OBJ) -o kwin_gesture
%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@
run:build
	./kwin_gesture
clean:
	rm *.o kwin_gesture
install:build
	sudo cp ./kwin_gesture /usr/local/bin/
