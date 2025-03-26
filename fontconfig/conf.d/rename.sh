for file in *.xml; do
    mv -- "$file" "${file%.xml}.conf"
done
