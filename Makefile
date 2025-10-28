export

ifeq ($(OS),Windows_NT)
    # Windows
    SHELL = cmd.exe
	RM = del /Q obj\
else
    # Linux
    SHELL = /bin/bash
	RM = rm -f obj/
endif

# имя конечного файла
TARGET = app.exe

# компилятор и флаги
CXX = g++

CXXFLAGS = -I "C:/DiskD/libs/SFML-3.0.2/include" \
-I "C:\DiskD\libs\stbImage" \
-std=c++17 -Wall -o2

LDFLAGS = -L "C:/DiskD/libs/SFML-3.0.2/lib" \
-lsfml-graphics -lsfml-window -lsfml-system

# исходники
SRC = $(wildcard src/*.cpp)
OBJ = $(patsubst src/%.cpp, obj/%.o, $(SRC))

# сборка
$(TARGET): $(OBJ)
	$(CXX) $(CXXFLAGS) $(OBJ) -o $(TARGET) $(LDFLAGS)

obj/%.o: src/%.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

#очистка
clean:
	$(RM)*.o *.exe
