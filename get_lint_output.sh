#!/bin/bash
tsc --noEmit > lint_errors.txt
wc -l lint_errors.txt
head -n 20 lint_errors.txt
